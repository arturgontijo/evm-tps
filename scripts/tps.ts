import { ethers, network } from "hardhat";
import axios from "axios";
import fs from 'fs';

import { deploy } from "./common";

import { Wallet } from "@ethersproject/wallet";
import { BigNumber } from "@ethersproject/bignumber";
import { SimpleToken } from "../typechain-types";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { PopulatedTransaction } from "ethers/lib/ethers";

const CONFIG_FILE_PATH: string = './config.json';

interface TPSConfig {
  endpoint: string;
  variant: string;
  chainId: number;
  senders: string[];
  receivers: string[];
  tokenAddress: string;
  tokenAmountToMint: number;
  tokenTransferMultipler: number;
  tokenAssert: boolean | undefined;
  transactions: number;
  gasPrice: string;
  gasLimit: string;
  txpoolMaxLength: number;
  txpoolMultiplier: number;
  txpoolCheckDelay: number;
  delay: number;
  estimate: boolean | undefined;
  payloads: UnsignedTx[] | PopulatedTransaction[] | undefined;
}

interface UnsignedTx {
  from: string;
  to: string;
  value?: BigNumber | string;
  data: string;
  gasPrice?: BigNumber | string;
  gasLimit?: BigNumber | string;
  nonce?: number;
  chainId?: number;
}

interface Mapping {
  sender: Wallet;
  receiver: Wallet;
  unsigned: UnsignedTx | PopulatedTransaction;
}

const setup = () => {
  // @ts-ignore
  let url = network.config.url;
  let config: TPSConfig = {
    endpoint: url || "http://127.0.0.1:9944",
    variant: "substrate",
    chainId: -1,
    senders: [
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E000",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E001",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E002",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E003",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E004"
    ],
    receivers: [
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E005",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E006",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E007",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E008",
      "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E009"
    ],
    tokenAddress: "",
    tokenAmountToMint: 1000000000,
    tokenTransferMultipler: 1,
    tokenAssert: true,
    transactions: 30000,
    gasPrice: "",
    gasLimit: "200000",
    txpoolMaxLength: -1,
    txpoolMultiplier: 2,
    txpoolCheckDelay: 250,
    delay: 0,
    estimate: false,
    payloads: undefined,
  };

  if (fs.existsSync(CONFIG_FILE_PATH)) {
    let rawdata = fs.readFileSync(CONFIG_FILE_PATH);
    let fromJSON = JSON.parse(rawdata.toString());
    config = { ...config, ...fromJSON };
  }

  return config;
}

const estimateOnly = async (config: TPSConfig, provider: StaticJsonRpcProvider, aliceAddress: string, token: SimpleToken) => {
  let unsigned = config.payloads![0] || await token.populateTransaction.transferLoop(config.tokenTransferMultipler, aliceAddress, 1);
  unsigned = {
    ...unsigned,
    gasPrice: await provider.getGasPrice(),
    chainId: provider.network.chainId,
  };
  console.log(`[EstGas] Payload:\n${JSON.stringify(unsigned, null, 2)}\n`);
  let estimateGas;
  for (let i = 0; i < config.transactions; i++) {
    estimateGas = await provider.estimateGas(unsigned);
  }
  console.log(`\nLast estimateGas result: ${estimateGas}`);
}

const getTxPoolStatus = async (config: TPSConfig) => {
  let method = "author_pendingExtrinsics";
  if (config.variant === "geth") method = "txpool_content";
  else if (config.variant === "parity") method = "parity_pendingTransactions";

  let r = await axios.post(
    config.endpoint,
    { jsonrpc: "2.0", method, id: 1 },
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (r.data == undefined || r.data.error) return [];
  if (config.variant === "geth") {
    let pending: any = [];
    for (let k of Object.keys(r.data.result.pending)) {
      pending = pending.concat(Object.keys(r.data.result.pending[k]));
    }
    return pending;
  }
  return r.data.result;
}

const sendRawTransactions = async (
  config: TPSConfig, senders: Wallet[], receivers: Wallet[], txpool_max_length: number
) => {
  console.log(`\n[  TPS ] Sending ${config.transactions} Axios-RAW transfer() transactions...`);

  let mapping: Mapping[] = [];
  for (let idx in senders) {
    let sender = senders[idx];
    let receiver = receivers[idx];

    let unsigned = config.payloads ? config.payloads[idx] : undefined;
    if (config.tokenAddress) {
      let token = (await ethers.getContractFactory("SimpleToken", sender)).attach(config.tokenAddress);
      unsigned = await token.populateTransaction.transferLoop(config.tokenTransferMultipler, receiver.address, 1);
    }

    if (!unsigned) throw Error(`[ERROR ] Not able to build "unsigned" payload!`);

    unsigned = {
      ...unsigned,
      gasLimit: ethers.BigNumber.from(config.gasLimit),
      gasPrice: await ethers.provider.getGasPrice(),
      nonce: await sender.getTransactionCount(),
      chainId: config.chainId,
    };

    mapping[idx] = {
      sender,
      receiver,
      unsigned,
    }

    console.log(`[  TPS ] Payload[${idx}]:\n${JSON.stringify(unsigned, null, 2)}\n`);
  }

  let txpool;
  let checkTxpool = false;
  let payload;
  let r;
  let last;

  let mIdx = 0;
  let sentTransactions = senders.map(() => 0);
  let lastHashes = senders.map(() => "");
  let counter = 1;
  while (counter <= config.transactions) {

    if (mIdx >= mapping.length) mIdx = 0;

    payload = await mapping[mIdx].sender.signTransaction(mapping[mIdx].unsigned);
    r = await axios.post(
      config.endpoint,
      {
        jsonrpc: "2.0",
        method: "eth_sendRawTransaction",
        params: [payload],
        id: 1
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (config.delay > 0) await new Promise(r => setTimeout(r, config.delay));

    last = r.data ? r.data.result ? r.data.result : r.data.error : 'Error';
    if (r.status != 200 || last == 'Error') {
      console.log(`[  TPS ] eth_sendRawTransaction Failed!`);
      mapping[mIdx].unsigned.nonce = await mapping[mIdx].sender.getTransactionCount();
      continue;
    };

    mapping[mIdx].unsigned.nonce!++;
    if (counter % 1000 == 0) {
      console.log(`[  TPS ][${counter}]`);
      for (let m of mapping) {
        console.log(`[  TPS ] ${m.sender.address}: ${m.unsigned.nonce}`);
      }
    }

    // Check Txpool
    if (counter % txpool_max_length == 0 || checkTxpool) {
      txpool = await getTxPoolStatus(config);
      console.log(`[Txpool] Counter: ${counter} [len=(${JSON.stringify(txpool.length)})]`);
      let last_length = 0;
      while (txpool.length >= txpool_max_length) {
        if (last_length !== txpool.length) {
          console.log(`[Txpool] len=(${JSON.stringify(txpool.length)}) is still too high, waiting a bit...`);
          last_length = txpool.length;
        }
        await new Promise(r => setTimeout(r, config.txpoolCheckDelay));
        txpool = await getTxPoolStatus(config);
        checkTxpool = true;
      }
      if (txpool.length < (txpool_max_length * 0.80)) checkTxpool = false;
      if (checkTxpool) await new Promise(r => setTimeout(r, config.txpoolCheckDelay));
    }
    sentTransactions[mIdx]++;
    lastHashes[mIdx] = last;
    counter++;
    mIdx++;
  };

  console.log(`[  TPS ] Done!`);

  console.log(`[  TPS ] Waiting for the last transactions' receipts...`);
  for (let lastHash of lastHashes) {
    last = await ethers.provider.getTransaction(lastHash);
    let r = await last.wait();
    console.log(`
      "transactionHash": ${r.transactionHash}\t
      "from": ${r.from}\t
      "to": ${r.to}\t
      "blockNumber": ${r.blockNumber}\t
      "gasUsed": ${r.gasUsed}
    `);
  }

  return sentTransactions;
};

const main = async () => {
  const config = setup();
  console.log(`\n---- Simple EVM TPS Tool ----\n\n${JSON.stringify(config, null, 2)}\n`);

  config.chainId = config.chainId === -1 ? (await ethers.provider.getNetwork()).chainId : config.chainId;
  let gasPrice = config.gasPrice === "" ? await ethers.provider.getGasPrice() : ethers.BigNumber.from(config.gasPrice);
  let gasLimit = ethers.BigNumber.from(config.gasLimit);

  const staticProvider = new ethers.providers.StaticJsonRpcProvider(config.endpoint, { name: 'tps', chainId: config.chainId });

  let senders = config.senders.map((key) => new ethers.Wallet(key, staticProvider));
  let receivers = config.receivers.map((key) => new ethers.Wallet(key, staticProvider));

  let deployer = senders[0];

  let token: SimpleToken;
  let tokenAddress = config.tokenAddress || "";
  if (config.payloads?.length) tokenAddress = config.payloads[0].to ? config.payloads[0].to : tokenAddress;

  if (tokenAddress === "" && config.payloads === undefined) {
    token = await deploy(deployer);

    console.log(`\n[ Token] Calling start()...`);
    let tx1 = await token.start({ gasLimit, gasPrice });
    await tx1.wait();

    let mintTx;
    for (let sender of senders) {
      console.log(`[ Token] Calling mintTo(${sender.address}, ${config.tokenAmountToMint})`);
      mintTx = await token.mintTo(sender.address, config.tokenAmountToMint, { gasLimit, gasPrice });
      await mintTx.wait();
    }

    // First call to transfer() is more expensive than the next ones due to initial variables setup.
    let probeTx;
    for (let receiver of receivers) {
      console.log(`[ Token] Calling probe transfer(${receiver.address}, 1})`);
      probeTx = await token.transfer(receiver.address, 1, { gasLimit, gasPrice });
      await probeTx.wait();
    }

    config.tokenAddress = token.address;

  } else token = (await ethers.getContractFactory("SimpleToken", deployer)).attach(tokenAddress);

  let estimateGasTx;
  if (config.payloads?.length) estimateGasTx = await staticProvider.estimateGas(config.payloads[0]);
  else estimateGasTx = await token.estimateGas.transferLoop(config.tokenTransferMultipler, receivers[0].address, 1, { gasPrice });

  if (estimateGasTx.gt(gasLimit)) {
    console.log(`\n[  Gas ] estimateGas > config.gasLimit | ${estimateGasTx} > ${config.gasLimit}`);
    console.log(`[  Gas ] config.gasLimit=${estimateGasTx}`);
    config.gasLimit = estimateGasTx.toString();
  }

  let txpool_max_length = config.txpoolMaxLength;
  // We pre calculate the max txn per block we can get and set the txpool max size to 3x as it is.
  if (txpool_max_length === -1) {
    console.log(`\n[Txpool] Trying to get a proper Txpool max length...`);
    let last_block = await ethers.provider.getBlock("latest");
    console.log(`[Txpool] Block gasLimit   : ${last_block.gasLimit}`);
    console.log(`[Txpool] Txn estimateGas  : ${estimateGasTx}`);
    let max_txn_block = last_block.gasLimit.div(estimateGasTx).toNumber();
    console.log(`[Txpool] Max txn per Block: ${max_txn_block}`);
    let max_txn_multiplier = max_txn_block * config.txpoolMultiplier;
    if (max_txn_multiplier > 5000) txpool_max_length = Math.round(max_txn_multiplier / 1000) * 1000;
    else txpool_max_length = max_txn_multiplier;
    console.log(`[Txpool] Max length       : ${txpool_max_length}`);
  }

  let amountsBefore = await Promise.all(receivers.map(async (acc) => await acc.getBalance()));
  if (config.tokenAssert) amountsBefore = await Promise.all(receivers.map(async (acc) => await token.balanceOf(acc.address)));

  const start = Date.now();

  let execution_time = start;
  if (config.estimate) {
    await estimateOnly(config, staticProvider, deployer.address, token);
    execution_time = Date.now() - start;
  } else {
    const sentTransactions = await sendRawTransactions(config, senders, receivers, txpool_max_length);

    execution_time = Date.now() - start;

    let amountsAfter = await Promise.all(receivers.map(async (acc) => await acc.getBalance()));
    if (config.tokenAssert) amountsAfter = await Promise.all(receivers.map(async (acc) => await token.balanceOf(acc.address)));

    let value = 0;
    if (config.payloads?.length) value = ethers.BigNumber.from(config.payloads[0].value || "0").toNumber();


    for (let i in amountsBefore) {
      let amountBefore = amountsBefore[i];
      let amountAfter = amountsAfter[i];
      if (value) {
        console.log(
          `Assert(ETH): ${amountBefore} + (${sentTransactions[i]} * ${value}) == ${amountAfter} [${(amountBefore.add(sentTransactions[i] * value)).eq(amountAfter) ? 'OK' : 'FAIL'}]`
        );
      } else {
        console.log(
          `Assert(balanceOf): ${amountBefore} + (${sentTransactions[i]} * ${config.tokenTransferMultipler}) == ${amountAfter} [${(amountBefore.add(sentTransactions[i] * config.tokenTransferMultipler)).eq(amountAfter) ? 'OK' : 'FAIL'}]`
        );
      }
    }
  }

  console.log(`\nExecution time: ${execution_time} ms -> ${(config.transactions / execution_time) * 1000} TPS/RPS`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

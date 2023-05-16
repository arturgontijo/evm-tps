import { ethers } from "hardhat";
import axios from "axios";
import fs from 'fs';

import { deploy } from "./common";

import { Wallet } from "@ethersproject/wallet";
import { BigNumber } from "@ethersproject/bignumber";
import { SimpleToken } from "../typechain-types";
import { StaticJsonRpcProvider } from "@ethersproject/providers";

const CONFIG_FILE_PATH: string = './config.json';

interface TPSConfig {
  endpoint: string;
  variant: string;
  deployerPK: string;
  otherPK: string;
  tokenAddress: string;
  tokenAssert: boolean | undefined;
  transactions: number;
  gasLimit: string;
  txpoolMaxLength: number;
  txpoolMultiplier: number;
  txpoolCheckDelay: number;
  delay: number;
  estimate: boolean | undefined;
  transaction: UnsignedTx | undefined;
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

const setup = () => {
  let config: TPSConfig = {
    endpoint: "http://127.0.0.1:8545",
    variant: "substrate",
    deployerPK: "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342",
    otherPK: "0xE2033D436CE0614ACC1EE15BD20428B066013F827A15CC78B063F83AC0BAAE64",
    tokenAddress: "",
    tokenAssert: true,
    transactions: 10000,
    gasLimit: "200000",
    txpoolMaxLength: -1,
    txpoolMultiplier: 2,
    txpoolCheckDelay: 250,
    delay: 0,
    estimate: false,
    transaction: undefined,
  };

  if (fs.existsSync(CONFIG_FILE_PATH)) {
    let rawdata = fs.readFileSync(CONFIG_FILE_PATH);
    let fromJSON = JSON.parse(rawdata.toString());
    config = { ...config, ...fromJSON };
  }

  return config;
}

const estimateOnly = async (config: TPSConfig, provider: StaticJsonRpcProvider, aliceAddress: string, token: SimpleToken) => {
  let unsigned = config.transaction || await token.populateTransaction.transfer(aliceAddress, 1);
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
  config: TPSConfig, signer: Wallet, chainId: number, aliceAddress: string, token: SimpleToken, txpool_max_length: number,
) => {
  console.log(`\n[  TPS ] Sending ${config.transactions} Axios-RAW transfer() transactions...`);

  let unsigned = config.transaction || await token.populateTransaction.transfer(aliceAddress, 1);;
  unsigned = {
    ...unsigned,
    gasLimit: ethers.BigNumber.from(config.gasLimit),
    gasPrice: await ethers.provider.getGasPrice(),
    nonce: await signer.getTransactionCount(),
    chainId,
  };

  console.log(`[  TPS ] Payload:\n${JSON.stringify(unsigned, null, 2)}\n`);

  let txpool;
  let check_txpool = false;
  let payload;
  let r;
  let last;

  let final_nonce = unsigned.nonce! + config.transactions;
  let counter = 1;

  console.log(`[  TPS ] StartingNonce / FinalNonce -> ${unsigned.nonce} / ${final_nonce}`);
  while (unsigned.nonce! < final_nonce) {
    payload = await signer.signTransaction(unsigned);
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
      unsigned.nonce = await signer.getTransactionCount();
      continue;
    };

    unsigned.nonce!++;
    if (unsigned.nonce! % 1000 == 0) console.log(`[  TPS ] NextNonce: ${unsigned.nonce} / ${final_nonce}`);

    // Check Txpool
    if (counter % txpool_max_length == 0 || check_txpool) {
      txpool = await getTxPoolStatus(config);
      console.log(`[Txpool] NextNonce: ${unsigned.nonce} / ${final_nonce} [len=(${JSON.stringify(txpool.length)})]`);
      let last_length = 0;
      while (txpool.length >= txpool_max_length) {
        if (last_length !== txpool.length) {
          console.log(`[Txpool] len=(${JSON.stringify(txpool.length)}) is still too high, waiting a bit...`);
          last_length = txpool.length;
        }
        await new Promise(r => setTimeout(r, config.txpoolCheckDelay));
        txpool = await getTxPoolStatus(config);
        check_txpool = true;
      }
      if (txpool.length < (txpool_max_length * 0.80)) check_txpool = false;
      if (check_txpool) await new Promise(r => setTimeout(r, config.txpoolCheckDelay));
    }
    counter++;
  };

  console.log(`[  TPS ] Done!`);
  last = await ethers.provider.getTransaction(last);
  console.log(`[  TPS ] Waiting for the last transaction's receipt...`);
  return await last.wait();
};

const main = async () => {
  const config = setup();
  console.log(`\n---- Simple EVM TPS Tool ----\n\n${JSON.stringify(config, null, 2)}\n`);

  let chainId = (await ethers.provider.getNetwork()).chainId;
  let gasPrice = await ethers.provider.getGasPrice();
  let gasLimit = ethers.BigNumber.from(config.gasLimit);

  const staticProvider = new ethers.providers.StaticJsonRpcProvider(config.endpoint, { name: 'tps', chainId });

  let deployer = new ethers.Wallet(config.deployerPK, staticProvider);
  let other = new ethers.Wallet(config.otherPK, staticProvider);

  let token: SimpleToken;
  let tokenAddress = config.tokenAddress || config.transaction?.to || "";

  if (tokenAddress === "" && config.transaction === undefined) {
    token = await deploy(deployer);
    console.log(`\n[ Token] Calling start()...`);
    let tx1 = await token.start({ gasLimit, gasPrice });
    await tx1.wait();
    console.log(`[ Token] Calling mintTo()...`);
    let mintTx = await token.mintTo(deployer.address, 1000000000, { gasLimit, gasPrice });
    await mintTx.wait();
    console.log(`[ Token] Calling probe transfer()...`);
    // First call to transfer() is more expensive than the next ones due to initial variables setup.
    let probeTx = await token.transfer(other.address, 1, { gasLimit, gasPrice });
    await probeTx.wait();
  } else token = (await ethers.getContractFactory("SimpleToken", deployer)).attach(tokenAddress);

  let txpool_max_length = config.txpoolMaxLength;
  // We pre calculate the max txn per block we can get and set the txpool max size to 3x as it is.
  if (txpool_max_length === -1) {
    console.log(`\n[Txpool] Trying to get a proper Txpool max length...`);
    let estimateGasTx;
    if (config.transaction) estimateGasTx = await staticProvider.estimateGas(config.transaction);
    else estimateGasTx = await token.estimateGas.transfer(other.address, 1, { gasPrice });
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

  let amountBefore = await other.getBalance();
  if (config.tokenAssert) amountBefore = await token.balanceOf(other.address);

  const start = Date.now();

  let execution_time = start;
  if (config.estimate) {
    await estimateOnly(config, staticProvider, other.address, token);
    execution_time = Date.now() - start;
  } else {
    let r = await sendRawTransactions(config, deployer, chainId, other.address, token, txpool_max_length);

    execution_time = Date.now() - start;

    console.log(
      `\nLast transaction:\n\t
      "transactionHash": ${r.transactionHash}\t
      "from": ${r.from}\t
      "to": ${r.to}\t
      "blockNumber": ${r.blockNumber}\t
      "gasUsed": ${r.gasUsed}`
    );


    let amountAfter = await other.getBalance();
    if (config.tokenAssert) amountAfter = await token.balanceOf(other.address);
    let value = ethers.BigNumber.from(config.transaction?.value || "0").toNumber();
    if (value) {
      console.log(
        `\nAssert(ETH): ${amountBefore} + (${config.transactions} * ${value}) == ${amountAfter} [${(amountBefore.add(config.transactions * value)).eq(amountAfter) ? 'OK' : 'FAIL'}]`
      );
    } else {
      console.log(
        `\nAssert(balanceOf): ${amountBefore} + (${config.transactions}) == ${amountAfter} [${(amountBefore.add(config.transactions)).eq(amountAfter) ? 'OK' : 'FAIL'}]`
      );
    }
  }

  console.log(`\nExecution time: ${execution_time} ms -> ${(config.transactions / execution_time) * 1000} TPS/RPS`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

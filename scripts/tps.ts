import { ethers } from "hardhat";
import axios from "axios";

import { deploy } from "./common";

import { Wallet } from "@ethersproject/wallet";
import { SimpleToken } from "../typechain-types";

const ETHEREUM_RPC_ENDPOINT: string = process.env.ETHEREUM_RPC_ENDPOINT || "http://127.0.0.1:8545";
const ETHEREUM_JSONRPC_VARIANT: string = process.env.ETHEREUM_JSONRPC_VARIANT || "substrate";

const DEPLOYER_PK: string = process.env.DEPLOYER_PK || "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342";
const TOKEN_ADDRESS: string = process.env.TOKEN_ADDRESS || "";

const TRANSACTIONS: number = parseInt(process.env.TRANSACTIONS as string) || 10000;
const GAS_LIMIT: string = process.env.GAS_LIMIT || "200000";

const TXPOOL_MAX_LENGTH: number = parseInt(process.env.TXPOOL_MAX_LENGTH as string) || -1;
const TXPOOL_CHECK_DELAY: number = parseInt(process.env.TXPOOL_CHECK_DELAY as string) || 250;

const DELAY: number = parseInt(process.env.DELAY as string) || 0;

const getTxPoolStatus = async (url: string) => {
  let method = "author_pendingExtrinsics";
  if (ETHEREUM_JSONRPC_VARIANT === "geth") method = "txpool_content";
  else if (ETHEREUM_JSONRPC_VARIANT === "parity") method = "parity_pendingTransactions";

  let r = await axios.post(
    url,
    { jsonrpc: "2.0", method, id: 1 },
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (r.data == undefined || r.data.error) return [];
  if (ETHEREUM_JSONRPC_VARIANT === "geth") {
    let pending: any = [];
    for (let k of Object.keys(r.data.result.pending)) {
      pending = pending.concat(Object.keys(r.data.result.pending[k]));
    }
    return pending;
  }
  return r.data.result;
}

const sendRawTransactions = async (
  signer: Wallet, url: string, chainId: number, aliceAddress: string, token: SimpleToken, txpool_max_length: number,
) => {
  console.log(`\n[  TPS ] Sending ${TRANSACTIONS} Axios-RAW mintTo() transactions...`);

  let unsigned = await token.populateTransaction.mintTo(aliceAddress, 1);
  unsigned = {
    ...unsigned,
    gasLimit: ethers.BigNumber.from(GAS_LIMIT),
    gasPrice: await ethers.provider.getGasPrice(),
    nonce: await signer.getTransactionCount(),
    chainId,
  };

  let txpool;
  let check_txpool = false;
  let payload;
  let r;
  let last;

  let final_nonce = unsigned.nonce! + TRANSACTIONS;
  let counter = 1;

  while (unsigned.nonce! < final_nonce) {
    payload = await signer.signTransaction(unsigned);
    r = await axios.post(
      url,
      {
        jsonrpc: "2.0",
        method: "eth_sendRawTransaction",
        params: [payload],
        id: 1
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (DELAY > 0) await new Promise(r => setTimeout(r, DELAY));

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
      txpool = await getTxPoolStatus(url);
      console.log(`[Txpool] NextNonce: ${unsigned.nonce} / ${final_nonce} [len=(${JSON.stringify(txpool.length)})]`);
      let last_length = 0;
      while (txpool.length > txpool_max_length) {
        if (last_length !== txpool.length) {
          console.log(`[Txpool] len=(${JSON.stringify(txpool.length)}) is still too high, waiting a bit...`);
          last_length = txpool.length;
        }
        await new Promise(r => setTimeout(r, TXPOOL_CHECK_DELAY));
        txpool = await getTxPoolStatus(url);
        check_txpool = true;
      }
      if (txpool.length < (txpool_max_length / 2)) check_txpool = false;
      if (check_txpool) await new Promise(r => setTimeout(r, TXPOOL_CHECK_DELAY));
    }
    counter++;
  };

  last = await ethers.provider.getTransaction(last);
  return last;
};

const main = async () => {
  const [owner, alice] = await ethers.getSigners();

  let chainId = (await ethers.provider.getNetwork()).chainId;
  let gasPrice = await ethers.provider.getGasPrice();
  let gasLimit = ethers.BigNumber.from(GAS_LIMIT);

  let url = ETHEREUM_RPC_ENDPOINT;

  const staticProvider = new ethers.providers.StaticJsonRpcProvider(url, { name: 'tps', chainId });

  let deployer = new ethers.Wallet(DEPLOYER_PK, staticProvider);

  let token: SimpleToken;

  if (TOKEN_ADDRESS === "") {
    token = await deploy(deployer);
    let tx1 = await token.start({ gasLimit, gasPrice });
    await tx1.wait();
    // Sending a first txn because it is expensive than the next ones.
    let probeTx = await token.mintTo(alice.address, 1, { gasLimit, gasPrice });
    await probeTx.wait();
  } else token = (await ethers.getContractFactory("SimpleToken", deployer)).attach(TOKEN_ADDRESS);

  let txpool_max_length = TXPOOL_MAX_LENGTH;
  // We pre calculate the max txn per block we can get and set the txpool max size to 2x as it is.
  if (txpool_max_length === -1) {
    console.log(`[Txpool] Trying to get a proper Txpool max length...`);
    let estimateGasTx = await token.estimateGas.mintTo(alice.address, 1, { gasPrice });
    let last_block = await ethers.provider.getBlock("latest");
    console.log(`[Txpool] Block gasLimit   : ${last_block.gasLimit}`);
    console.log(`[Txpool] Txn estimateGas  : ${estimateGasTx}`);
    let max_txn_block = last_block.gasLimit.div(estimateGasTx).toNumber();
    console.log(`[Txpool] Max txn per Block: ${max_txn_block}`);
    txpool_max_length = Math.round((max_txn_block * 2) / 1000) * 1000;
    console.log(`[Txpool] Max length       : ${txpool_max_length}`);
  }

  let amountBefore = await token.balanceOf(alice.address);

  const start = Date.now();

  let last_tx = await sendRawTransactions(deployer, url, chainId, alice.address, token, txpool_max_length);
  let r = await last_tx.wait();

  let execution_time = Date.now() - start;

  // Cleaning few fields before printing it
  console.log(
    `\nLast transaction:\n\t
    "transactionHash": ${r.transactionHash}\t
    "from": ${r.from}\t
    "to": ${r.to}\t
    "blockNumber": ${r.blockNumber}\t
    "gasUsed": ${r.gasUsed}`
  );

  let amountAfter = await token.balanceOf(alice.address);

  console.log(
    `\nAssert(balanceOf): ${amountBefore} + ${TRANSACTIONS} == ${amountAfter} [${(amountBefore.add(TRANSACTIONS)).eq(amountAfter) ? 'OK' : 'FAIL'}]\n`
  );

  console.log(`Execution time: ${execution_time} ms -> ${(TRANSACTIONS / execution_time) * 1000} TPS`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

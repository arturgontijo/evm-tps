# Sample EVM TPS tool

```shell
git clone https://github.com/arturgontijo/evm-tps.git
cd evm-tps

yarn
```

You can change some ENV vars, most important ones:

- `DEPLOYER_PK="0x..."` (the account that will deploy and send transactions)
- `TOKEN_ADDRESS="0x..."` (once you deploy the token contract, by running the `tps.ts` script without setting this var, you should set it to avoid deploying it again each time)

```shell
npx hardhat run scripts/tps.ts --network local
```

# Simple EVM TPS tool

```shell
git clone https://github.com/arturgontijo/evm-tps.git
cd evm-tps

yarn
```

You can change parameters in [config.json](./config.json):

1. This will deploy the ERC20 contract and will send 30,000 `transfer()` transactions, asserting final Other's token balance:
```json
{
    "endpoint": "http://127.0.0.1:9944",
    "variant": "substrate",
    "deployerPK": "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342",
    "otherPK": "0xE2033D436CE0614ACC1EE15BD20428B066013F827A15CC78B063F83AC0BAAE64",
    "tokenAddress": "",
    "tokenAssert": true,
    "transactions": 30000,
    "gasLimit": "200000",
    "txpoolMaxLength": -1,
    "txpoolMultiplier": 2,
    "txpoolCheckDelay": 250,
    "delay": 0,
    "estimate": false
}
```

2. This one already has the token deployed at `tokenAddress`, so it will only send 30,000 `transfer()` transactions + tokenAssert:
```json
{
    "endpoint": "http://127.0.0.1:9944",
    "variant": "substrate",
    "deployerPK": "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342",
    "otherPK": "0xE2033D436CE0614ACC1EE15BD20428B066013F827A15CC78B063F83AC0BAAE64",
    "tokenAddress": "0x20c8554eA6dAeD9467BCD202936572828F9D75c9",
    "tokenAssert": true,
    "transactions": 30000,
    "gasLimit": "200000",
    "txpoolMaxLength": -1,
    "txpoolMultiplier": 2,
    "txpoolCheckDelay": 250,
    "delay": 0,
    "estimate": false
}
```


3. This one has a `transaction` hardcoded, that is a `transfer()`:
```json
{
    "endpoint": "http://127.0.0.1:9944",
    "variant": "substrate",
    "deployerPK": "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342",
    "otherPK": "0xE2033D436CE0614ACC1EE15BD20428B066013F827A15CC78B063F83AC0BAAE64",
    "tokenAddress": "0x20c8554eA6dAeD9467BCD202936572828F9D75c9",
    "tokenAssert": true,
    "transactions": 30000,
    "gasLimit": "200000",
    "txpoolMaxLength": -1,
    "txpoolMultiplier": 2,
    "txpoolCheckDelay": 250,
    "delay": 0,
    "estimate": false,
    "transaction": {
        "from": "0x6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b",
        "to": "0x20c8554eA6dAeD9467BCD202936572828F9D75c9",
        "data": "0x449a52f8000000000000000000000000004e5062fb8c93c6cf5187bf499d9fa9117dde160000000000000000000000000000000000000000000000000000000000000001"
    }
}
```

4. This one sends ETH (`send()`) via `transaction` field and assert the destination `"to"` ETH balance at the end:
```json
{
    "endpoint": "http://127.0.0.1:9944",
    "variant": "substrate",
    "deployerPK": "0x99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342",
    "otherPK": "0xE2033D436CE0614ACC1EE15BD20428B066013F827A15CC78B063F83AC0BAAE64",
    "tokenAddress": "",
    "tokenAssert": false,
    "transactions": 30000,
    "gasLimit": "200000",
    "txpoolMaxLength": -1,
    "txpoolMultiplier": 2,
    "txpoolCheckDelay": 250,
    "delay": 0,
    "estimate": false,
    "transaction": {
        "from": "0x6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b",
        "to": "0x004e5062fb8C93c6cf5187bF499d9fa9117dDe16",
        "value": "0x14"
    }
}
```

To run the script:

```shell
npx hardhat run scripts/tps.ts --network local
```

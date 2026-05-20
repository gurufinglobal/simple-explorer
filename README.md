# Frontend

## Local Development

```bash
npm install
npm run dev
```

## Multi-chain Configuration

You can register the list of chains as a JSON string in your `.env.local`. This enables selection from the `Chain` dropdown at the top of the left sidebar.

```env
NEXT_PUBLIC_DEFAULT_CHAIN_KEY=guru-testnet
NEXT_PUBLIC_CHAINS=[{"key":"guru-testnet","name":"GURU-TESTNET","lcdUrl":"https://tguru.gurufin.com:1317","rpcUrl":"https://tguru.gurufin.com:26657","bech32Prefix":"guru"},{"key":"zeta-chain","name":"Zeta-chain","lcdUrl":"https://zetachain.blockpi.network/lcd/v1/public"}]
```

- `key`: Internal identifier (saved in cookie)
- `name`: Display name for UI
- `lcdUrl`: LCD API endpoint for each chain (required)
- `rpcUrl`: Tendermint RPC endpoint for each chain (optional, uses default if omitted)
- `evmRpcUrl`: EVM RPC endpoint for each chain (optional, uses default if omitted)
- `wsUrl`: Optional (websocket address for realtime)
- `evmChainId`: Optional (WalletConnect `eip155:<id>`)
- `bech32Prefix`: Optional (prefix for EVM->Cosmos address conversion)

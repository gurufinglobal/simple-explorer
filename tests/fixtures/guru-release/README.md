# Guru v2.1.0 codec vectors

Generated with the actual `app.MakeEncodingConfig`, SDK sign-mode handlers,
`ethsecp256k1.PrivKey.Sign` and `PubKey.VerifySignature` from:

- Guru `release/v2.1.0@da4cfbc7652c56ab982a35a85d12c24871558959`
- Cosmos SDK `v0.53.6`
- Cosmos EVM `v0.6.2`, replaced by `github.com/gurufinglobal/evm v0.6.3-guru.1`
- Go `1.26.7`, Darwin arm64

`generate.go` uses published scalar 1 solely as a test vector. It opens no node
home, wallet or network connection. It rejects a signature over altered bytes
before emitting each fixture. The vectors use 65-byte signatures; service tests
also exercise Keplr-style 64-byte signatures.

To regenerate, set `GURA_SOURCE` to the pinned Guru checkout and `GURA_EXPLORER`
to this repository. Use the release Go toolchain and an isolated build cache:

```sh
cd "$GURA_SOURCE"
GOWORK=off GOPROXY=off GOSUMDB=off GOCACHE="$(mktemp -d)" \
  go run -mod=readonly "$GURA_EXPLORER/tests/fixtures/guru-release/generate.go" \
  > /tmp/gura-release-vectors.json
cmp /tmp/gura-release-vectors.json "$GURA_EXPLORER/tests/fixtures/guru-release/vectors.json"
```

Dependencies must already be available in the Go module cache. This is an
offline codec comparison, not an ante-handler, fee-policy, node-build or live
wallet certification. Do not send transactions using the test-vector key.

Run the service and cross-language comparisons from the Explorer checkout:

```sh
npx vitest run tests/integration/guru-release-codec.integration.test.ts
```

import { ripemd160, sha256 } from '@cosmjs/crypto';
import { bech32 } from 'bech32';
import type { ChainConfig } from '@/lib/env';

// Public curve generator; no private key or real wallet is used by these fixtures.
export const cosmosPubkey = Uint8Array.from(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'));
export const cosmosAddress = bech32.encode('guru', bech32.toWords(ripemd160(sha256(cosmosPubkey))));
export const cosmosSigningProfile: NonNullable<ChainConfig['signingProfile']> = {
  family: 'cosmos', chainVersion: 'synthetic-sdk', accountTypeUrl: '/cosmos.auth.v1beta1.BaseAccount',
  pubkeyTypeUrl: '/cosmos.crypto.secp256k1.PubKey', addressAlgorithm: 'cosmos', signModes: ['direct', 'amino'],
  evidence: 'Synthetic standard Cosmos boundary only; no TGXN support assertion',
};

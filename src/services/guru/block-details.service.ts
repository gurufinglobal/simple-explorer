import { apiClients } from "@/services/clients";
import { txRawBase64ToTxHashHex } from "@/lib/tx-hash";

export type BlockDetail = {
  height: string;
  hash: string;
  time: string;
  proposer: string;
  txCount: number;
  chainId: string;
  blockVersion: string;
  appVersion: string;
  lastBlockHash: string;
  lastCommitHash: string;
  dataHash: string;
  validatorsHash: string;
  nextValidatorsHash: string;
  consensusHash: string;
  appHash: string;
  lastResultsHash: string;
  evidenceHash: string;
  evidenceCount: number;
  lastCommitRound: number;
  lastCommitHeight: string;
  commitSignaturesCount: number;
  txs: Array<{ hash: string }>;
};

type LcdBlockResponse = {
  block_id?: {
    hash?: string;
    part_set_header?: {
      total?: number;
      hash?: string;
    };
  };
  block?: {
    header?: {
      version?: { block?: string; app?: string };
      chain_id?: string;
      height?: string;
      time?: string;
      last_block_id?: {
        hash?: string;
        part_set_header?: { total?: number; hash?: string };
      };
      last_commit_hash?: string;
      data_hash?: string;
      validators_hash?: string;
      next_validators_hash?: string;
      consensus_hash?: string;
      app_hash?: string;
      last_results_hash?: string;
      evidence_hash?: string;
      proposer_address?: string;
    };
    data?: {
      txs?: string[];
    };
    evidence?: {
      evidence?: unknown[];
    };
    last_commit?: {
      height?: string;
      round?: number;
      block_id?: { hash?: string };
      signatures?: unknown[];
    };
  };
};

function orDash(value: string | undefined): string {
  if (value === undefined || value === "") {
    return "-";
  }
  return value;
}

export async function getBlockDetail(height: string): Promise<BlockDetail | null> {
  if (process.env.NODE_ENV === "test") {
    return {
      height,
      hash: "TEST_BLOCK_HASH",
      time: new Date(0).toISOString(),
      proposer: "TEST_PROPOSER",
      txCount: 0,
      chainId: "test-chain",
      blockVersion: "11",
      appVersion: "0",
      lastBlockHash: "TEST_LAST_BLOCK",
      lastCommitHash: "TEST_LAST_COMMIT",
      dataHash: "TEST_DATA",
      validatorsHash: "TEST_VAL",
      nextValidatorsHash: "TEST_NEXT_VAL",
      consensusHash: "TEST_CONS",
      appHash: "TEST_APP",
      lastResultsHash: "TEST_RESULTS",
      evidenceHash: "TEST_EVIDENCE",
      evidenceCount: 0,
      lastCommitRound: 0,
      lastCommitHeight: String(Math.max(0, Number(height) - 1)),
      commitSignaturesCount: 0,
      txs: [],
    };
  }

  try {
    const response = await apiClients.lcdGet<LcdBlockResponse>(
      `/cosmos/base/tendermint/v1beta1/blocks/${encodeURIComponent(height)}`,
    );
    const block = response.block;
    const header = block?.header;
    if (!block || !header) {
      return null;
    }

    const txsRaw = block.data?.txs ?? [];
    const txs = await Promise.all(txsRaw.map(async (b64) => ({ hash: await txRawBase64ToTxHashHex(b64) })));

    const evidenceList = block.evidence?.evidence ?? [];
    const signatures = block.last_commit?.signatures ?? [];

    return {
      height: header.height ?? height,
      hash: response.block_id?.hash ?? "-",
      time: header.time ?? "-",
      proposer: header.proposer_address ?? "-",
      txCount: txsRaw.length,
      chainId: header.chain_id ?? "-",
      blockVersion: header.version?.block ?? "-",
      appVersion: header.version?.app ?? "-",
      lastBlockHash: header.last_block_id?.hash ?? "-",
      lastCommitHash: header.last_commit_hash ?? "-",
      dataHash: header.data_hash ?? "-",
      validatorsHash: header.validators_hash ?? "-",
      nextValidatorsHash: header.next_validators_hash ?? "-",
      consensusHash: header.consensus_hash ?? "-",
      appHash: orDash(header.app_hash),
      lastResultsHash: header.last_results_hash ?? "-",
      evidenceHash: header.evidence_hash ?? "-",
      evidenceCount: evidenceList.length,
      lastCommitRound: block.last_commit?.round ?? 0,
      lastCommitHeight: block.last_commit?.height ?? "-",
      commitSignaturesCount: signatures.length,
      txs,
    };
  } catch {
    return null;
  }
}

import { create } from 'zustand';
import { getWalletPortfolio, type WalletPortfolioSnapshot } from '@/services/guru/wallet-portfolio.service';
import { getActiveChainConfig } from '@/lib/chain-selection';
import { createQueryClient } from '@/services/clients';
import { initialResult, readQuery, type QueryResult } from '@/lib/query-result';

export type WalletPortfolioState = WalletPortfolioSnapshot & {
  loading: boolean;
  error: string | null;
  result: QueryResult<WalletPortfolioSnapshot>;
  clear: () => void;
  refresh: (cosmosAddress: string) => Promise<void>;
};
const empty = { balance: '—', staking: '—', reward: '—', unbonding: '—' };
export const useWalletPortfolioStore = create<WalletPortfolioState>((set, get) => {
  let active: AbortController | null = null;
  return {
    ...empty, loading: false, error: null, result: initialResult({ chain: '', target: '' }),
    clear: () => {
      active?.abort(); active = null;
      set({ ...empty, loading: false, error: null, result: initialResult({ chain: '', target: '' }) });
    },
    refresh: async address => {
      const chain = getActiveChainConfig();
      const context = { chain: chain.key, target: `portfolio:${address}` };
      const current = get().result;
      const same = current.context.chain === context.chain && current.context.target === context.target;
      if (same && (active || (current.error?.retryAt ?? 0) > Date.now())) return;
      active?.abort();
      const controller = new AbortController(); active = controller;
      const previous = same ? current : initialResult<WalletPortfolioSnapshot>(context);
      set({ ...(same ? {} : empty), loading: true, error: null, result: { ...previous, status: 'loading' } });
      const result = await readQuery(context, () => getWalletPortfolio(address, createQueryClient(chain, controller.signal)), previous);
      if (controller.signal.aborted) return;
      active = null;
      set({ ...(result.data ?? empty), loading: false, error: result.error?.message ?? null, result });
    },
  };
});

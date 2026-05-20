import { create } from "zustand";
import { getWalletPortfolio } from "@/services/guru/wallet-portfolio.service";

export type WalletPortfolioState = {
  balance: string;
  staking: string;
  reward: string;
  unbonding: string;
  loading: boolean;
  error: string | null;
  clear: () => void;
  refresh: (cosmosAddress: string) => Promise<void>;
};

const EMPTY = "—";

export const useWalletPortfolioStore = create<WalletPortfolioState>((set) => ({
  balance: EMPTY,
  staking: EMPTY,
  reward: EMPTY,
  unbonding: EMPTY,
  loading: false,
  error: null,
  clear: () =>
    set({
      balance: EMPTY,
      staking: EMPTY,
      reward: EMPTY,
      unbonding: EMPTY,
      loading: false,
      error: null,
    }),
  refresh: async (cosmosAddress) => {
    set({ loading: true, error: null });
    try {
      const p = await getWalletPortfolio(cosmosAddress);
      set({
        balance: p.balance,
        staking: p.staking,
        reward: p.reward,
        unbonding: p.unbonding,
        loading: false,
        error: null,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "포트폴리오를 불러오지 못했습니다.",
      });
    }
  },
}));

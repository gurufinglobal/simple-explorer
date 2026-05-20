import { create } from "zustand";

export type ResolvedType = "txHash" | "address" | "blockHeight" | "validator" | "token";

type SearchResolutionState = {
  query: string;
  resolvedType: ResolvedType | null;
  hasConflict: boolean;
  candidates: ResolvedType[];
  setResolution: (
    query: string,
    resolvedType: ResolvedType,
    hasConflict: boolean,
    candidates: ResolvedType[],
  ) => void;
};

export const useSearchResolutionStore = create<SearchResolutionState>((set) => ({
  query: "",
  resolvedType: null,
  hasConflict: false,
  candidates: [],
  setResolution: (query, resolvedType, hasConflict, candidates) =>
    set({ query, resolvedType, hasConflict, candidates }),
}));

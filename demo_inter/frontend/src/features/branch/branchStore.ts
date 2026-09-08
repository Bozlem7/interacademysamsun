import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ActiveBranch {
  id?: string;
  code: string;
  name: string;
}

interface BranchState {
  activeBranch: ActiveBranch | null;
  setActiveBranch: (b: ActiveBranch) => void;
  clearActiveBranch: () => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      activeBranch: null,
      setActiveBranch: (b) => set({ activeBranch: b }),
      clearActiveBranch: () => set({ activeBranch: null }),
    }),
    { name: "inter-academy-branch" }
  )
);

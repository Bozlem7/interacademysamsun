import { apiClient } from "../../lib/apiClient";

export interface Branch {
  id: string;
  name: string;
  code: string;
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data } = await apiClient.get("/branches");
  return data;
}

const BRANCH_ORDER: Record<string, number> = { vezirkopru: 0, atakum: 1 };

export function sortBranches(branches: Branch[]): Branch[] {
  return [...branches].sort((a, b) => (BRANCH_ORDER[a.code] ?? 99) - (BRANCH_ORDER[b.code] ?? 99));
}

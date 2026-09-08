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

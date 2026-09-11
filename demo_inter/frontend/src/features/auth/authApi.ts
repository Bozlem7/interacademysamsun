import { apiClient } from "../../lib/apiClient";

interface BranchInfo {
  id: string;
  name: string;
  code: string;
}

export async function staffOrAdminLogin(kind: "staff" | "admin", username: string, password: string, branchCode: string) {
  const { data } = await apiClient.post(`/auth/${kind}-login`, { username, password, branchCode });
  return data as {
    token: string;
    user: {
      id: string;
      username: string;
      role: "yonetici" | "egitmen";
      fullName: string;
      specialty: "antrenor" | "diyetisyen" | "psikolog" | null;
      isGlobalStaff?: boolean;
    };
    branch: BranchInfo;
  };
}

export async function parentLogin(tcNo: string, branchCode: string) {
  const { data } = await apiClient.post("/auth/parent-login", { tcNo, branchCode });
  return data as { token: string; student: { id: string; fullName: string; group: string | null }; branch: BranchInfo };
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Specialty } from "../../lib/specialtyColors";

export type Role = "yonetici" | "egitmen" | "veli";

export interface SessionBranch {
  id: string;
  name: string;
  code: string;
}

interface AuthState {
  token: string | null;
  role: Role | null;
  displayName: string | null;
  roleLabel: string | null;
  studentId: string | null;
  branch: SessionBranch | null;
  /** Yalnızca egitmen oturumları için — panel temalandırmasında kullanılır. */
  specialty: Specialty | null;
  /** Diyetisyen/psikolog için true: şube bağımsız çalışır, panelde tüm şubelerin verisini görür. */
  isGlobalStaff: boolean;
  login: (data: {
    token: string;
    role: Role;
    displayName: string;
    roleLabel: string;
    studentId?: string;
    branch: SessionBranch;
    specialty?: Specialty | null;
    isGlobalStaff?: boolean;
  }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      displayName: null,
      roleLabel: null,
      studentId: null,
      branch: null,
      specialty: null,
      isGlobalStaff: false,
      login: ({ token, role, displayName, roleLabel, studentId, branch, specialty, isGlobalStaff }) =>
        set({
          token,
          role,
          displayName,
          roleLabel,
          studentId: studentId ?? null,
          branch,
          specialty: specialty ?? null,
          isGlobalStaff: isGlobalStaff ?? false,
        }),
      logout: () =>
        set({
          token: null,
          role: null,
          displayName: null,
          roleLabel: null,
          studentId: null,
          branch: null,
          specialty: null,
          isGlobalStaff: false,
        }),
    }),
    { name: "inter-academy-auth" }
  )
);

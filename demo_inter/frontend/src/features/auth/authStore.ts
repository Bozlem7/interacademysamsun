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
  username: string | null;
  displayName: string | null;
  roleLabel: string | null;
  studentId: string | null;
  branch: SessionBranch | null;
  /** Yalnızca egitmen oturumları için — panel temalandırmasında kullanılır. */
  specialty: Specialty | null;
  /** Diyetisyen/psikolog için true: şube bağımsız çalışır, panelde tüm şubelerin verisini görür. */
  isGlobalStaff: boolean;
  /** Yönetici hesapları arasında ek yetki ayrımı: aidat durumunu "Ödendi" olarak işaretleyebilme. */
  canManagePayments: boolean;
  login: (data: {
    token: string;
    role: Role;
    username?: string;
    displayName: string;
    roleLabel: string;
    studentId?: string;
    branch: SessionBranch;
    specialty?: Specialty | null;
    isGlobalStaff?: boolean;
    canManagePayments?: boolean;
  }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      username: null,
      displayName: null,
      roleLabel: null,
      studentId: null,
      branch: null,
      specialty: null,
      isGlobalStaff: false,
      canManagePayments: false,
      login: ({ token, role, username, displayName, roleLabel, studentId, branch, specialty, isGlobalStaff, canManagePayments }) =>
        set({
          token,
          role,
          username: username ?? null,
          displayName,
          roleLabel,
          studentId: studentId ?? null,
          branch,
          specialty: specialty ?? null,
          isGlobalStaff: isGlobalStaff ?? false,
          canManagePayments: canManagePayments ?? false,
        }),
      logout: () =>
        set({
          token: null,
          role: null,
          username: null,
          displayName: null,
          roleLabel: null,
          studentId: null,
          branch: null,
          specialty: null,
          isGlobalStaff: false,
          canManagePayments: false,
        }),
    }),
    { name: "inter-academy-auth" }
  )
);

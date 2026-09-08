import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parentLogin } from "../../features/auth/authApi";
import { useAuthStore } from "../../features/auth/authStore";
import { useBranchStore } from "../../features/branch/branchStore";
import { tcErrorMessage } from "../../lib/tcValidation";

export function ParentLoginPage() {
  const [tcNo, setTcNo] = useState("");
  const [error, setError] = useState("");
  const login = useAuthStore((s) => s.login);
  const session = useAuthStore((s) => s);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const navigate = useNavigate();
  const otherSessionOpen = !!session.token && !!session.role && session.role !== "veli";

  useEffect(() => {
    if (!activeBranch) navigate("/");
  }, [activeBranch, navigate]);

  async function submit() {
    if (!activeBranch) return;
    if (otherSessionOpen) {
      setError("Lütfen önce mevcut oturumunuzu kapatın");
      return;
    }
    setError("");
    const tcError = tcErrorMessage(tcNo);
    if (tcError) {
      setError(tcError);
      return;
    }
    try {
      const { token, student, branch } = await parentLogin(tcNo, activeBranch.code);
      login({
        token,
        role: "veli",
        displayName: student.fullName,
        roleLabel: student.group ? `${student.group} Velisi` : "Veli Oturumu",
        studentId: student.id,
        branch,
      });
      navigate("/veli/panel");
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Giriş başarısız");
    }
  }

  if (!activeBranch) return null;

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-5 py-16">
      <div className="w-full max-w-md">
        <span className="mb-3 inline-block rounded-full bg-[#010E80] px-3 py-1 text-xs font-bold text-white">
          {activeBranch.name} Şubesi
        </span>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Veli Takip Girişi</h2>
        <p className="mt-2 mb-6 text-sm text-slate-500 dark:text-slate-400">
          Şifre yok. Sadece öğrencinizin T.C. kimlik numarasını girin.
        </p>
        {otherSessionOpen && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            Lütfen önce mevcut oturumunuzu kapatın
          </div>
        )}
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}
        <input
          value={tcNo}
          onChange={(e) => setTcNo(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="11 haneli numara"
          maxLength={11}
          inputMode="numeric"
          disabled={otherSessionOpen}
          className="mb-4 w-full rounded-2xl border-2 border-slate-200 bg-paper2 p-4 text-lg tracking-widest text-slate-900 outline-none focus:border-brand disabled:opacity-50 dark:border-slate-700 dark:bg-surface dark:text-white"
        />
        <button
          onClick={submit}
          disabled={otherSessionOpen}
          className="w-full rounded-2xl bg-brand py-4 text-base font-bold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Giriş Yap
        </button>
      </div>
    </div>
  );
}

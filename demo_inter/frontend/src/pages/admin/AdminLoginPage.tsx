import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { staffOrAdminLogin } from "../../features/auth/authApi";
import { useAuthStore } from "../../features/auth/authStore";
import { useBranchStore } from "../../features/branch/branchStore";

export function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useAuthStore((s) => s.login);
  const session = useAuthStore((s) => s);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const navigate = useNavigate();
  const otherSessionOpen = !!session.token && !!session.role && session.role !== "yonetici";

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
    try {
      const { token, user, branch } = await staffOrAdminLogin("admin", username, password, activeBranch.code);
      login({ token, role: "yonetici", displayName: user.username, roleLabel: "Yönetici Oturumu", branch });
      navigate("/yonetici/panel");
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
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Yönetici Girişi</h2>
        <p className="mt-2 mb-6 text-sm text-slate-500 dark:text-slate-400">
          Yönetici hesabınızla giriş yapın. Yönetici hesapları her iki şubeden de giriş yapabilir.
        </p>
        {otherSessionOpen && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            Lütfen önce mevcut oturumunuzu kapatın
          </div>
        )}
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Kullanıcı adı"
          disabled={otherSessionOpen}
          autoComplete="off"
          className="mb-3 w-full rounded-2xl border-2 border-slate-200 bg-paper2 p-4 text-sm text-slate-900 outline-none focus:border-brand disabled:opacity-50 dark:border-slate-700 dark:bg-surface dark:text-white"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••••••"
          disabled={otherSessionOpen}
          autoComplete="new-password"
          className="mb-5 w-full rounded-2xl border-2 border-slate-200 bg-paper2 p-4 text-sm text-slate-900 outline-none focus:border-brand disabled:opacity-50 dark:border-slate-700 dark:bg-surface dark:text-white"
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

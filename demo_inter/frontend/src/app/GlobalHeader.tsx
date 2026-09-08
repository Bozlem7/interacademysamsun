import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../features/auth/authStore";
import { usePreRegRequestStore } from "../features/preReg/preRegStore";
import { useBranchStore } from "../features/branch/branchStore";
import { fetchBranches, Branch } from "../features/branch/branchApi";
import { BranchEntryButton } from "./BranchEntryButton";
import { ThemeToggle } from "../components/common/ThemeToggle";
import { SPECIALTY_THEME } from "../lib/specialtyColors";

const LANDING_NAV = [
  { label: "Hakkımızda", href: "#hakkimizda" },
  { label: "Antrenman Programı", href: "#antrenman-programi" },
  { label: "Haberler", href: "#haberler" },
  { label: "İletişim", href: "#iletisim" },
];

const FALLBACK_BRANCHES: Branch[] = [
  { id: "atakum", name: "Atakum", code: "atakum" },
  { id: "vezirkopru", name: "Vezirköprü", code: "vezirkopru" },
];

const ROLE_PANEL: Record<string, { path: string; label: string }> = {
  yonetici: { path: "/yonetici/panel", label: "Yönetici Paneline Dön" },
  egitmen: { path: "/egitmen/panel", label: "Eğitmen Paneline Dön" },
  veli: { path: "/veli/panel", label: "Veli Paneline Dön" },
};

function navBtnClass(active: boolean) {
  return active
    ? "whitespace-nowrap rounded-[10px] border border-blue-400 bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm"
    : "whitespace-nowrap rounded-[10px] border border-white/40 bg-transparent px-3.5 py-2 text-xs font-bold text-white hover:bg-white/10";
}

export function GlobalHeader() {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const { token, role, roleLabel, displayName, branch, specialty, logout } = useAuthStore();
  const sessionBadgeClass =
    role === "egitmen" && specialty
      ? SPECIALTY_THEME[specialty].badge
      : "border border-white/30 bg-white/10 text-white";
  const clearActiveBranch = useBranchStore((s) => s.clearActiveBranch);
  const requestPreReg = usePreRegRequestStore((s) => s.requestOpen);
  const [navOpen, setNavOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>(FALLBACK_BRANCHES);
  const isLanding = pathname === "/";
  const isAuthenticated = !!token && !!role;
  const panel = role ? ROLE_PANEL[role] : undefined;
  const showReturnToPanel = isAuthenticated && !!panel && pathname !== panel.path;

  useEffect(() => {
    fetchBranches()
      .then((b) => b.length && setBranches(b))
      .catch(() => {});
  }, []);

  function doLogout() {
    logout();
    clearActiveBranch();
    navigate("/");
  }

  function openPreReg() {
    requestPreReg();
    setNavOpen(false);
    if (pathname !== "/") navigate("/");
  }

  return (
    <header className="sticky top-0 z-[60] w-full">
      <div className="flex flex-wrap items-center gap-2 bg-[#010E80] px-2 py-2 lg:flex-nowrap">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1.5" title="Ana Sayfa">
          <img src="/inter-logo-white.png" alt="Inter Academy Turkey" className="block h-12 w-auto object-contain md:h-16" />
        </Link>

        <Link to="/" className={navBtnClass(isLanding)}>
          ANA SAYFA
        </Link>

        {!isAuthenticated && (
          <div className="hidden items-center gap-2 md:flex">
            {branches.map((b) => (
              <BranchEntryButton key={b.code} code={b.code} name={b.name} />
            ))}
          </div>
        )}

        {isAuthenticated && branch && (
          <span className="rounded-full border border-white/30 bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white">
            [Samsun - {branch.name}]
          </span>
        )}

        {showReturnToPanel && (
          <button
            onClick={() => navigate(panel!.path)}
            className="whitespace-nowrap rounded-[10px] border-none bg-[#FFE600] px-3.5 py-2 text-xs font-extrabold text-[#0F172A] shadow-sm animate-pulse"
          >
            {panel!.label}
          </button>
        )}

        <button
          onClick={openPreReg}
          className="whitespace-nowrap rounded-[10px] border-none bg-white px-3.5 py-2 text-xs font-bold text-[#010E80]"
        >
          ÖN KAYIT BAŞVURU
        </button>

        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated && (
            <div className="hidden items-center gap-2 sm:flex">
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${sessionBadgeClass}`}>
                {displayName} · {roleLabel}
              </span>
              <button
                onClick={doLogout}
                className="whitespace-nowrap rounded-[10px] border border-white/30 bg-transparent px-4 py-2.5 text-xs font-bold text-white hover:bg-white/10"
              >
                Çıkış Yap
              </button>
            </div>
          )}
          <ThemeToggle />
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/30 bg-transparent text-white md:hidden"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile: branch entry / session info (collapsed under burger) */}
      <div className={`bg-[#0B112C] px-5 ${navOpen ? "block" : "hidden"} md:hidden`}>
        <div className="grid gap-2 py-3">
          {!isAuthenticated &&
            branches.map((b) => (
              <div key={b.code} onClick={() => setNavOpen(false)}>
                <BranchEntryButton code={b.code} name={b.name} variant="card" />
              </div>
            ))}
          {isAuthenticated && branch && (
            <div className="rounded-[11px] bg-[#111827] px-3.5 py-3 text-center text-xs font-extrabold text-white">
              [Samsun - {branch.name}]
            </div>
          )}
          {showReturnToPanel && (
            <button
              onClick={() => {
                setNavOpen(false);
                navigate(panel!.path);
              }}
              className="rounded-[11px] bg-[#FFE600] px-3.5 py-3 text-center text-xs font-extrabold text-[#0F172A]"
            >
              {panel!.label}
            </button>
          )}
          {isAuthenticated && (
            <div className={`mt-1 flex items-center justify-between rounded-[11px] px-3.5 py-3 ${role === "egitmen" && specialty ? SPECIALTY_THEME[specialty].badge : "bg-[#111827]"}`}>
              <span className={`text-xs font-bold ${role === "egitmen" && specialty ? "" : "text-slate-300"}`}>
                {displayName} · {roleLabel}
              </span>
              <button onClick={doLogout} className="text-xs font-bold text-red-400">
                Çıkış Yap
              </button>
            </div>
          )}
        </div>
      </div>

      {isLanding && (
        <div className="bg-[#0B112C] px-5">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-8 py-2">
            {LANDING_NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-lg px-6 py-2.5 text-base font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../features/auth/authStore";
import { usePreRegRequestStore } from "../features/preReg/preRegStore";
import { useBranchStore } from "../features/branch/branchStore";
import { fetchBranches, sortBranches, Branch } from "../features/branch/branchApi";
import { BranchEntryButton } from "./BranchEntryButton";
import { ThemeToggle } from "../components/common/ThemeToggle";
import { SPECIALTY_THEME } from "../lib/specialtyColors";

// Sıra sabittir: Ana Sayfa, Antrenman Programı, Haberler, İletişim — ardından şubeler (Vezirköprü, Atakum).
const LANDING_NAV = [
  { label: "Antrenman Programı", href: "#antrenman-programi" },
  { label: "Haberler", href: "#haberler" },
  { label: "İletişim", href: "#iletisim" },
];

const DESKTOP_LANDING_NAV = [{ label: "Hakkımızda", href: "#hakkimizda" }, ...LANDING_NAV];

const FALLBACK_BRANCHES: Branch[] = sortBranches([
  { id: "atakum", name: "Atakum", code: "atakum" },
  { id: "vezirkopru", name: "Vezirköprü", code: "vezirkopru" },
]);

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
  const headerRef = useRef<HTMLElement>(null);
  const [branches, setBranches] = useState<Branch[]>(FALLBACK_BRANCHES);
  const isLanding = pathname === "/";
  const isAuthenticated = !!token && !!role;
  const panel = role ? ROLE_PANEL[role] : undefined;
  const showReturnToPanel = isAuthenticated && !!panel && pathname !== panel.path;

  useEffect(() => {
    fetchBranches()
      .then((b) => b.length && setBranches(sortBranches(b)))
      .catch(() => {});
  }, []);

  // Mobil menü açıkken dışına tıklanınca kapat.
  useEffect(() => {
    if (!navOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [navOpen]);

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
    <header ref={headerRef} className="sticky top-0 z-[60] w-full">
      <div className="flex h-16 w-full flex-nowrap items-center justify-between gap-2 bg-[#010E80] px-2.5 sm:px-4">
        {/* Sol taraf: logo (tek parça, mobilde küçültülmüş) */}
        <Link to="/" className="flex shrink-0 items-center gap-2.5" title="Ana Sayfa">
          <img src="/inter-logo-white.png" alt="Inter Academy Turkey" className="block h-8 w-auto object-contain sm:h-10 md:h-12" />
        </Link>

        {/* Sağ taraf: aksiyon butonları tek satırda */}
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
          <Link to="/" className={`hidden md:inline-flex ${navBtnClass(isLanding)}`}>
            ANA SAYFA
          </Link>

          {!isAuthenticated && (
            <div className="hidden items-center gap-2 lg:flex">
              {branches.map((b) => (
                <BranchEntryButton key={b.code} code={b.code} name={b.name} />
              ))}
            </div>
          )}

          {isAuthenticated && branch && (
            <span className="hidden rounded-full border border-white/30 bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white sm:inline-block">
              [Samsun - {branch.name}]
            </span>
          )}

          {showReturnToPanel && (
            <button
              onClick={() => navigate(panel!.path)}
              className="hidden whitespace-nowrap rounded-[10px] border-none bg-[#FFE600] px-3.5 py-2 text-xs font-extrabold text-[#0F172A] shadow-sm animate-pulse md:inline-flex"
            >
              {panel!.label}
            </button>
          )}

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

          <button
            onClick={openPreReg}
            className="whitespace-nowrap rounded-full border-none bg-white px-3 py-1.5 text-[11px] font-bold text-[#010E80] shadow-sm sm:px-3.5 sm:py-2 sm:text-xs"
          >
            <span className="sm:hidden">KAYIT</span>
            <span className="hidden sm:inline">ÖN KAYIT BAŞVURU</span>
          </button>

          <ThemeToggle />
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/30 bg-transparent text-white md:hidden"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile: tek sıralı menü listesi — Ana Sayfa, Antrenman Programı, Haberler, İletişim, Vezirköprü, Atakum */}
      <div className={`relative z-[70] bg-[#0B112C] px-5 ${navOpen ? "block" : "hidden"} md:hidden`}>
        <nav className="flex flex-col gap-2 py-3">
          <Link
            to="/"
            onClick={() => setNavOpen(false)}
            className="rounded-[11px] px-3.5 py-3 text-sm font-bold text-white hover:bg-white/5"
          >
            Ana Sayfa
          </Link>
          {isLanding &&
            LANDING_NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setNavOpen(false)}
                className="rounded-[11px] px-3.5 py-3 text-sm font-bold text-white hover:bg-white/5"
              >
                {n.label}
              </a>
            ))}
          {!isAuthenticated &&
            branches.map((b) => (
              <BranchEntryButton
                key={b.code}
                code={b.code}
                name={b.name}
                variant="list"
                onNavigate={() => setNavOpen(false)}
              />
            ))}
        </nav>

        {(isAuthenticated || showReturnToPanel) && (
          <div className="grid gap-2 border-t border-white/10 py-3">
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
              <div className={`flex items-center justify-between rounded-[11px] px-3.5 py-3 ${role === "egitmen" && specialty ? SPECIALTY_THEME[specialty].badge : "bg-[#111827]"}`}>
                <span className={`text-xs font-bold ${role === "egitmen" && specialty ? "" : "text-slate-300"}`}>
                  {displayName} · {roleLabel}
                </span>
                <button onClick={doLogout} className="text-xs font-bold text-red-400">
                  Çıkış Yap
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop: landing sayfası ikincil nav şeridi (Hakkımızda dahil, her zaman görünür) */}
      {isLanding && (
        <div className="hidden bg-[#0B112C] px-5 md:block">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-8 py-2">
            {DESKTOP_LANDING_NAV.map((n) => (
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

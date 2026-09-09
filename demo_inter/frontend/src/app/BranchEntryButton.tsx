import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBranchStore } from "../features/branch/branchStore";

const ROLE_LINKS = [
  { to: "/veli", label: "Veli Girişi" },
  { to: "/egitmen", label: "Eğitmen Girişi" },
  { to: "/yonetici", label: "Yönetici Girişi" },
];

export function BranchEntryButton({
  code,
  name,
  variant = "compact",
  onNavigate,
}: {
  code: string;
  name: string;
  variant?: "compact" | "card" | "list";
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setActiveBranch = useBranchStore((s) => s.setActiveBranch);
  const navigate = useNavigate();

  function goTo(to: string) {
    setActiveBranch({ code, name });
    setOpen(false);
    navigate(to);
    onNavigate?.();
  }

  if (variant === "card") {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-surface"
          style={{ borderLeft: "4px solid #010E80" }}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8ecff] text-base font-bold text-[#010E80] dark:bg-[#010E80]/30">
            🏢
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{name} Şubesi</div>
            <div className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Panellere giriş yapın
            </div>
          </div>
          <span className="shrink-0 text-xs font-bold text-[#010E80] dark:text-[#93c5fd]">→</span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-paper2 shadow-xl dark:border-slate-700 dark:bg-surface">
              {ROLE_LINKS.map((r) => (
                <button
                  key={r.to}
                  onClick={() => goTo(r.to)}
                  className="block w-full px-5 py-3.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-surface2"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-[11px] px-3.5 py-3 text-left text-sm font-bold text-white hover:bg-white/5"
        >
          <span>{name}</span>
          <span className={`text-[10px] text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        {open && (
          <div className="mb-1 ml-2 flex flex-col gap-1 rounded-[11px] bg-white/5 p-1.5">
            {ROLE_LINKS.map((r) => (
              <button
                key={r.to}
                onClick={() => goTo(r.to)}
                className="rounded-lg px-3.5 py-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="whitespace-nowrap rounded-[10px] border border-white/40 bg-transparent px-3.5 py-2 text-xs font-bold text-white hover:bg-white/10"
      >
        {name} Şubesi
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-paper2 shadow-xl dark:border-slate-700 dark:bg-surface">
            {ROLE_LINKS.map((r) => (
              <button
                key={r.to}
                onClick={() => goTo(r.to)}
                className="block w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-surface2"
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

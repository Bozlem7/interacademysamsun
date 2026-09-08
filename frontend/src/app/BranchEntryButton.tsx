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
}: {
  code: string;
  name: string;
  variant?: "compact" | "card";
}) {
  const [open, setOpen] = useState(false);
  const setActiveBranch = useBranchStore((s) => s.setActiveBranch);
  const navigate = useNavigate();

  function goTo(to: string) {
    setActiveBranch({ code, name });
    setOpen(false);
    navigate(to);
  }

  if (variant === "card") {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full rounded-[20px] border border-slate-200 bg-paper2 p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-surface"
          style={{ borderLeft: "6px solid #010E80" }}
        >
          <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-2xl bg-[#e8ecff] text-[22px] font-bold text-[#010E80] dark:bg-[#010E80]/30">
            🏢
          </div>
          <div className="mb-1.5 text-[19px] font-extrabold text-slate-900 dark:text-white">{name} Şubesi</div>
          <div className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Samsun — {name} şubesindeki panellere giriş yapın.
          </div>
          <div className="text-sm font-bold text-[#010E80] dark:text-[#93c5fd]">Giriş Yap →</div>
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

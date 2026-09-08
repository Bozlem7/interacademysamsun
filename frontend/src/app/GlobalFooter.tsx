export function GlobalFooter() {
  return (
    <footer className="border-t border-slate-200 bg-paper2 px-4 py-10 dark:border-slate-800 dark:bg-surface sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-black px-3 py-2">
            <img src="/inter-logo-white.png" alt="Inter Academy" className="h-6 w-auto" />
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Inter Academy. Tüm hakları saklıdır.
          </span>
        </div>
        <div className="flex gap-5 text-xs font-bold text-slate-500 dark:text-slate-400">
          <a href="#hakkimizda" className="hover:text-[#010E80] dark:hover:text-[#93c5fd]">Hakkımızda</a>
          <a href="#antrenman-programi" className="hover:text-[#010E80] dark:hover:text-[#93c5fd]">Program</a>
          <a href="#iletisim" className="hover:text-[#010E80] dark:hover:text-[#93c5fd]">İletişim</a>
        </div>
      </div>
    </footer>
  );
}

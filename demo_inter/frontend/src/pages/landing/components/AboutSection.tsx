const ABOUT_BLOCKS = [
  { h: "Sahada Gelişim", b: "Yaş grubuna özel antrenman planları ile teknik ve fiziksel gelişim." },
  { h: "Mutfakta Denge", b: "Diyetisyen eşliğinde sporcuya özel beslenme takibi ve önerileri." },
  { h: "Zihinde Güç", b: "Spor psikoloğu desteğiyle motivasyon ve performans odaklı görüşmeler." },
];

export function AboutSection() {
  return (
    <section id="hakkimizda" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mb-2.5 text-xs font-extrabold tracking-[1.2px] text-[#0057B8] dark:text-[#93c5fd]">HAKKIMIZDA</div>
      <div className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[32px]">
        Sahada, mutfakta ve zihinde birlikte gelişim
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ABOUT_BLOCKS.map((b) => (
          <div
            key={b.h}
            className="rounded-[18px] border border-slate-200 border-t-[5px] border-t-[#010E80] bg-paper2 p-5 dark:border-slate-800 dark:border-t-[#010E80] dark:bg-surface"
          >
            <div className="mb-1.5 text-base font-extrabold text-slate-900 dark:text-white">{b.h}</div>
            <div className="text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">{b.b}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

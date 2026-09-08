import { INSTAGRAM_HREF } from "../../../lib/socialLinks";

export function ContactSection() {
  return (
    <section id="iletisim" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mb-2.5 text-xs font-extrabold tracking-[1.2px] text-[#0057B8] dark:text-[#93c5fd]">İLETİŞİM</div>
      <div className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[32px]">
        Bize ulaşın
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <a
          href="tel:+902121234567"
          className="rounded-[18px] border border-slate-200 bg-paper2 p-5 transition-all hover:scale-[1.03] hover:border-[#010E80] hover:bg-[#010E80] dark:border-slate-800 dark:bg-surface2"
        >
          <div className="mb-1.5 text-xs font-bold text-slate-400 group-hover:text-white">TELEFON</div>
          <div className="text-[17px] font-extrabold text-slate-900 dark:text-white">0212 123 45 67</div>
        </a>
        <a
          href="https://wa.me/905321142208"
          target="_blank"
          rel="noreferrer"
          className="rounded-[18px] border border-slate-200 bg-paper2 p-5 transition-all hover:scale-[1.03] hover:border-[#16A34A] hover:bg-[#16A34A] dark:border-slate-800 dark:bg-surface2"
        >
          <div className="mb-1.5 text-xs font-bold text-slate-400">WHATSAPP</div>
          <div className="text-[17px] font-extrabold text-slate-900 dark:text-white">0532 114 22 08</div>
        </a>
        <a
          href={INSTAGRAM_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[18px] border border-slate-200 bg-paper2 p-5 transition-all hover:scale-[1.03] hover:border-[#0057B8] hover:bg-[#0057B8] dark:border-slate-800 dark:bg-surface2"
        >
          <div className="mb-1.5 text-xs font-bold text-slate-400">INSTAGRAM</div>
          <div className="text-[17px] font-extrabold text-slate-900 dark:text-white">@interacademysamsun</div>
        </a>
        <div className="rounded-[18px] border border-slate-200 bg-paper2 p-5 dark:border-slate-800 dark:bg-surface2">
          <div className="mb-1.5 text-xs font-bold text-slate-400">ADRES</div>
          <div className="text-[14.5px] font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
            Inter Academy Tesisleri, Ataşehir / İstanbul
          </div>
        </div>
      </div>
    </section>
  );
}

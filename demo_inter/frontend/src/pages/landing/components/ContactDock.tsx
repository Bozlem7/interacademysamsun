import { useState } from "react";
import { INSTAGRAM_HREF } from "../../../lib/socialLinks";

const WHATSAPP_HREF =
  "https://wa.me/905321142208?text=Merhaba%2C%20Inter%20Academy%20kay%C4%B1t%20ve%20bilgi%20hatt%C4%B1%20ile%20ilgili%20bilgi%20almak%20istiyorum.";

export function ContactDock() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop: fixed right-side icon bar */}
      <div className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        <a
          href="tel:+902121234567"
          title="Çağrı Merkezi"
          className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-[#111827] text-white shadow-lg transition-transform hover:scale-110"
        >
          <span className="text-lg">✆</span>
        </a>
        <a
          href={INSTAGRAM_HREF}
          target="_blank"
          rel="noopener noreferrer"
          title="Instagram"
          className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-[#111827] text-xs font-bold text-white shadow-lg transition-transform hover:scale-110"
        >
          IG
        </a>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noreferrer"
          title="WhatsApp"
          className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-[#16A34A] text-lg text-white shadow-lg transition-transform hover:scale-110"
        >
          💬
        </a>
      </div>

      {/* Mobile: bottom-right pull tab + slide-out drawer */}
      <div className="md:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-2xl bg-[#010E80] py-3 pl-3 pr-2 text-white shadow-lg"
        >
          <span className="block text-[11px] font-extrabold [writing-mode:vertical-rl]">İletişim</span>
        </button>

        {drawerOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={() => setDrawerOpen(false)} />
            <div className="fixed right-0 top-0 z-50 h-full w-[78%] max-w-[300px] bg-paper2 p-5 shadow-2xl dark:bg-surface">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">Hızlı İletişim</span>
                <button onClick={() => setDrawerOpen(false)} className="text-lg text-slate-400">
                  ✕
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                <a href={WHATSAPP_HREF} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-surface2">
                  <span className="text-lg">💬</span>
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white">WhatsApp Hattı</span>
                </a>
                <a href="tel:+902121234567" className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-surface2">
                  <span className="text-lg">✆</span>
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white">Bizi Arayın</span>
                </a>
                <a href={INSTAGRAM_HREF} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-surface2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">IG</span>
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white">@interacademysamsun</span>
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

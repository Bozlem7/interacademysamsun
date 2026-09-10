import { useState } from "react";
import { INSTAGRAM_HREF } from "../../../lib/socialLinks";

const PHONE_DISPLAY = "+90 533 600 74 55";
const PHONE_TEL_HREF = "tel:+905336007455";
const WHATSAPP_HREF =
  "https://wa.me/905336007455?text=Merhaba%2C%20Inter%20Academy%20kay%C4%B1t%20ve%20bilgi%20hatt%C4%B1%20ile%20ilgili%20bilgi%20almak%20istiyorum.";

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.02 2C6.5 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.08-1.33A9.96 9.96 0 0 0 12.02 22C17.53 22 22 17.52 22 12S17.53 2 12.02 2Zm5.6 14.15c-.24.67-1.4 1.28-1.93 1.34-.5.06-1.03.28-3.47-.72-2.94-1.2-4.79-4.18-4.93-4.38-.14-.2-1.18-1.57-1.18-3 0-1.43.75-2.13 1.02-2.42.27-.29.58-.36.78-.36.2 0 .4 0 .57.01.19.01.44-.07.68.52.24.6.83 2.08.9 2.23.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.08.17-.2.72-.84.91-1.13.19-.29.38-.24.64-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.35Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ContactDock() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop: fixed right-side icon bar */}
      <div className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        <a
          href={PHONE_TEL_HREF}
          title="Çağrı Merkezi"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#374151] text-white shadow-lg transition-transform hover:scale-110"
        >
          <PhoneIcon />
        </a>
        <a
          href={INSTAGRAM_HREF}
          target="_blank"
          rel="noopener noreferrer"
          title="Instagram"
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg transition-transform hover:scale-110"
          style={{
            background:
              "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
          }}
        >
          <InstagramIcon />
        </a>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noreferrer"
          title="WhatsApp"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110"
        >
          <WhatsAppIcon />
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
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366] text-white">
                    <WhatsAppIcon />
                  </span>
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white">WhatsApp Hattı</span>
                </a>
                <a href={PHONE_TEL_HREF} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-surface2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#374151] text-white">
                    <PhoneIcon />
                  </span>
                  <span className="text-[13px] font-bold text-slate-900 dark:text-white">{PHONE_DISPLAY}</span>
                </a>
                <a href={INSTAGRAM_HREF} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-surface2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                    style={{
                      background:
                        "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                    }}
                  >
                    <InstagramIcon />
                  </span>
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

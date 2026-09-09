import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { HeroSlider } from "./HeroSlider";
import { PortalGrid } from "./PortalGrid";

const DEFAULTS = {
  "hero.badge": "Inter Academy",
  "hero.title": "Sahada, mutfakta ve zihinde birlikte gelişim",
  "hero.body":
    "Antrenman, beslenme ve psikolojik gelişimi tek çatı altında birleştiren spor akademisi yönetim platformu.",
};

export function HeroContent() {
  const [content, setContent] = useState(DEFAULTS);

  useEffect(() => {
    apiClient.get("/content/blocks").then((r) => {
      const map: Record<string, string> = {};
      (r.data ?? []).forEach((b: any) => {
        if (b.value) map[b.blockKey] = b.value;
      });
      if (Object.keys(map).length) setContent((c) => ({ ...c, ...map }));
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-4 pt-6 sm:px-6 sm:pt-16">
      <div className="hidden rounded-2xl bg-[#010E80] px-5 py-3 sm:inline-block">
        <img
          src="/inter-logo-white.png"
          alt="Inter Academy Türkiye Samsun"
          className="h-16 w-auto object-contain drop-shadow-md md:h-20"
        />
      </div>
      <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:mt-5 sm:text-4xl md:text-5xl">
        {content["hero.title"]}
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
        {content["hero.body"]}
      </p>

      <HeroSlider />
      <PortalGrid />
    </div>
  );
}

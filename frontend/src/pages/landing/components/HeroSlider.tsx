import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";

interface NewsSlide {
  id: string;
  imageUrl: string;
  title?: string;
  body?: string;
}

const newsSlides: NewsSlide[] = [
  {
    id: "fallback-1",
    imageUrl: "/haberinter.png",
    title: "Yeni Sezon Kayıtları Açıldı",
    body: "U-7'den U-16'ya kadar tüm yaş gruplarında ön kayıt başvuruları başladı.",
  },
];

export function HeroSlider() {
  const [slides, setSlides] = useState<NewsSlide[]>(newsSlides);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    apiClient.get("/content/slides").then((r) => {
      if (Array.isArray(r.data) && r.data.length > 0) setSlides(r.data);
    });
  }, []);

  function prev() {
    setIndex((i) => (i - 1 + slides.length) % slides.length);
  }
  function next() {
    setIndex((i) => (i + 1) % slides.length);
  }

  return (
    <div className="relative mt-6 h-[220px] w-full overflow-hidden rounded-3xl bg-[#111827] sm:h-[320px] md:h-[420px]">
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((sl) => (
          <div key={sl.id} className="relative h-full w-full shrink-0">
            {sl.imageUrl ? (
              <img src={sl.imageUrl} alt={sl.title ?? ""} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#010E80] to-[#0b1030] text-sm font-semibold text-slate-400">
                haber görseli · 1600×600
              </div>
            )}
            {(sl.title || sl.body) && (
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/30 to-transparent p-5 pt-14">
                {sl.title && <div className="text-lg font-extrabold text-white drop-shadow-md sm:text-xl">{sl.title}</div>}
                {sl.body && <div className="mt-1 text-sm text-slate-100 drop-shadow-md">{sl.body}</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60"
          >
            ‹
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 z-[3] flex justify-center gap-1.5">
            {slides.map((sl, i) => (
              <button
                key={sl.id}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-[#FFE600]" : "w-2 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

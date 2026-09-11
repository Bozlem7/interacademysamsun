import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { apiClient } from "../../../lib/apiClient";

interface NewsSlide {
  id: string;
  imageUrl: string;
  title?: string;
  body?: string;
  link?: string;
}

const newsSlides: NewsSlide[] = [
  {
    id: "fallback-1",
    imageUrl: "/haberinter.png",
    title: "Yeni Sezon Kayıtları Açıldı",
    body: "U-7'den U-16'ya kadar tüm yaş gruplarında ön kayıt başvuruları başladı.",
  },
];

const AUTOPLAY_MS = 4500;
const DRAG_THRESHOLD_PX = 40;
const CLICK_SUPPRESS_THRESHOLD_PX = 5;

export function HeroSlider() {
  const [slides, setSlides] = useState<NewsSlide[]>(newsSlides);
  const [index, setIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const dragStartX = useRef(0);
  const lastDeltaX = useRef(0);
  const justDraggedRef = useRef(false);
  const trackWidth = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Sabit varsayılan banner her zaman 0. index'te kalır; panelden eklenen haberler onun
  // peşine eklenir (üzerine yazılmaz) — böylece tek bir haber eklendiğinde bile slider
  // devreye girer, hiç eklenmediğinde de varsayılan görsel tek başına sorunsuz görünür.
  useEffect(() => {
    apiClient.get("/content/slides").then((r) => {
      const apiSlides: NewsSlide[] = Array.isArray(r.data) ? r.data : [];
      setSlides([...newsSlides, ...apiSlides]);
    });
  }, []);

  function prev() {
    setIndex((i) => (i - 1 + slides.length) % slides.length);
  }
  function next() {
    setIndex((i) => (i + 1) % slides.length);
  }

  // Otomatik oynatma: fare üzerideyken veya sürüklenirken durur, çekilince kaldığı yerden devam eder.
  useEffect(() => {
    if (slides.length <= 1 || isHovering || isDragging) return;
    const id = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [slides.length, isHovering, isDragging, index]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (slides.length <= 1) return;
    trackWidth.current = trackRef.current?.clientWidth ?? 1;
    dragStartX.current = e.clientX;
    lastDeltaX.current = 0;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX.current;
    lastDeltaX.current = deltaX;
    setDragOffset(deltaX);
  }

  function onPointerUp() {
    if (!isDragging) return;
    const deltaX = lastDeltaX.current;
    justDraggedRef.current = Math.abs(deltaX) > CLICK_SUPPRESS_THRESHOLD_PX;

    if (deltaX <= -DRAG_THRESHOLD_PX) next();
    else if (deltaX >= DRAG_THRESHOLD_PX) prev();

    setIsDragging(false);
    setDragOffset(0);
  }

  function onSlideClick(e: React.MouseEvent) {
    if (justDraggedRef.current) {
      e.preventDefault();
      justDraggedRef.current = false;
    }
  }

  const dragPercent = trackWidth.current ? (dragOffset / trackWidth.current) * 100 : 0;

  return (
    <div
      className="relative mx-auto mt-6 aspect-[1660/600] w-full max-w-[1660px] max-h-[600px] overflow-hidden rounded-3xl bg-[#111827]"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div
        ref={trackRef}
        className={`flex h-full cursor-grab touch-pan-y select-none active:cursor-grabbing ${
          isDragging ? "" : "transition-transform duration-500 ease-out"
        }`}
        style={{ transform: `translateX(calc(-${index * 100}% + ${isDragging ? dragPercent : 0}%))` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {slides.map((sl) => {
          const media = sl.imageUrl ? (
            <img
              src={sl.imageUrl}
              alt={sl.title ?? ""}
              draggable={false}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#010E80] to-[#0b1030] text-sm font-semibold text-slate-400">
              haber görseli · 1660×600
            </div>
          );

          const caption = (sl.title || sl.body) && (
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/30 to-transparent p-5 pt-14 sm:p-8">
              {sl.title && <div className="text-lg font-extrabold text-white drop-shadow-md sm:text-2xl">{sl.title}</div>}
              {sl.body && <div className="mt-1 text-sm text-slate-100 drop-shadow-md sm:text-base">{sl.body}</div>}
            </div>
          );

          return (
            <div key={sl.id} className="relative h-full w-full shrink-0">
              {sl.link ? (
                <a href={sl.link} onClick={onSlideClick} draggable={false} className="block h-full w-full">
                  {media}
                  {caption}
                </a>
              ) : (
                <>
                  {media}
                  {caption}
                </>
              )}
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Önceki"
            className="absolute left-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white opacity-70 backdrop-blur-sm transition hover:bg-white/20 hover:opacity-100 sm:h-12 sm:w-12"
          >
            ‹
          </button>
          <button
            onClick={next}
            aria-label="Sonraki"
            className="absolute right-3 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white opacity-70 backdrop-blur-sm transition hover:bg-white/20 hover:opacity-100 sm:h-12 sm:w-12"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center gap-1.5">
            {slides.map((sl, i) => (
              <button
                key={sl.id}
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}. slayta git`}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-[#FFE600]" : "w-2 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

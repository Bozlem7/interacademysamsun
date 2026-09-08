import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../../lib/apiClient";

interface Block {
  id: string;
  blockKey: string;
  contentType: "text" | "image";
  value: string | null;
}

interface Slide {
  id: string;
  imageUrl: string;
  title: string | null;
  body: string | null;
  sortOrder: number;
}

const KNOWN_KEYS = [
  { key: "hero.badge", label: "Hero Rozet" },
  { key: "hero.title", label: "Hero Başlık" },
  { key: "hero.body", label: "Hero Açıklama" },
];

export function AdminContentTab() {
  const [blocks, setBlocks] = useState<Record<string, Block | undefined>>({});
  const [draftBlocks, setDraftBlocks] = useState<Record<string, string>>({});
  const [blocksSaved, setBlocksSaved] = useState(false);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [newSlide, setNewSlide] = useState({ title: "", body: "" });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [slideError, setSlideError] = useState("");
  const [slidePreviewOpen, setSlidePreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [heroPreviewOpen, setHeroPreviewOpen] = useState(false);

  function load() {
    apiClient.get("/content/blocks").then((r) => {
      const map: Record<string, Block> = {};
      r.data.forEach((b: Block) => (map[b.blockKey] = b));
      setBlocks(map);
      setDraftBlocks((d) => {
        const next = { ...d };
        KNOWN_KEYS.forEach(({ key }) => {
          if (next[key] === undefined) next[key] = map[key]?.value ?? "";
        });
        return next;
      });
    });
  }
  function loadSlides() {
    apiClient.get("/content/slides").then((r) => setSlides(r.data));
  }
  useEffect(() => {
    load();
    loadSlides();
  }, []);

  async function publishHeroBlocks() {
    await Promise.all(
      KNOWN_KEYS.filter(({ key }) => draftBlocks[key] !== (blocks[key]?.value ?? "")).map(({ key }) =>
        apiClient.put(`/content/blocks/${key}`, { contentType: "text", value: draftBlocks[key] })
      )
    );
    load();
    setHeroPreviewOpen(false);
    setBlocksSaved(true);
    setTimeout(() => setBlocksSaved(false), 4000);
  }

  function selectFile(file: File) {
    setSlideError("");
    setPendingFile(file);
    setPendingPreviewUrl(URL.createObjectURL(file));
  }

  async function publishSlide() {
    if (!pendingFile) return;
    setSlideError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const { data } = await apiClient.post("/uploads/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await apiClient.post("/content/slides", {
        imageUrl: data.url,
        title: newSlide.title || undefined,
        body: newSlide.body || undefined,
        sortOrder: slides.length,
      });
      setNewSlide({ title: "", body: "" });
      setPendingFile(null);
      setPendingPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSlidePreviewOpen(false);
      loadSlides();
    } catch (e: any) {
      setSlideError(e.response?.data?.error?.message ?? "Görsel yüklenemedi");
    } finally {
      setUploading(false);
    }
  }

  async function removeSlide(id: string) {
    await apiClient.delete(`/content/slides/${id}`);
    loadSlides();
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface2 dark:text-white";

  return (
    <div className="p-7">
      <div className="mb-6 max-w-2xl rounded-3xl border border-slate-200 bg-paper2 p-6 dark:border-slate-800 dark:bg-surface">
        <div className="mb-1.5 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">SİTE İÇERİK YÖNETİMİ</div>
        <div className="mb-5 text-xl font-extrabold text-slate-900 dark:text-white">Landing sayfası metinleri</div>
        {blocksSaved && (
          <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
            ✓ İçerik yayınlandı.
          </div>
        )}
        <div className="flex flex-col gap-4">
          {KNOWN_KEYS.map(({ key, label }) => (
            <div key={key}>
              <label className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">{label}</label>
              <textarea
                value={draftBlocks[key] ?? ""}
                onChange={(e) => setDraftBlocks((d) => ({ ...d, [key]: e.target.value }))}
                rows={2}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => setHeroPreviewOpen(true)}
          className="mt-5 w-full rounded-xl bg-slate-100 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          👁 Ön Gösterim / Ön İzleme
        </button>
      </div>

      <div className="max-w-2xl rounded-3xl border border-slate-200 bg-paper2 p-6 dark:border-slate-800 dark:bg-surface">
        <div className="mb-1.5 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">SLIDER GÖRSELLERİ</div>
        <div className="mb-5 text-xl font-extrabold text-slate-900 dark:text-white">Ana sayfa banner slider'ı</div>

        {slideError && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{slideError}</div>}

        <div className="mb-5 flex flex-col gap-2.5 rounded-xl bg-slate-50 p-4 dark:bg-surface2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Yeni Görsel Ekle</label>
          <input
            placeholder="Başlık (opsiyonel)"
            value={newSlide.title}
            onChange={(e) => setNewSlide({ ...newSlide, title: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder="Açıklama (opsiyonel)"
            value={newSlide.body}
            onChange={(e) => setNewSlide({ ...newSlide, body: e.target.value })}
            className={inputCls}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && selectFile(e.target.files[0])}
            className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-bold file:text-white dark:text-slate-300"
          />
          <div className="text-[11px] text-slate-400">Önerilen boyut: 1600×600px (JPG/PNG/WEBP, maks. 5MB).</div>
          {pendingFile && (
            <button
              onClick={() => setSlidePreviewOpen(true)}
              className="mt-1 w-full rounded-xl bg-slate-100 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              👁 Ön Gösterim / Ön İzleme
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {slides.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
              <img src={s.imageUrl} alt={s.title ?? ""} className="h-16 w-28 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{s.title || "(başlıksız)"}</div>
                <div className="truncate text-xs text-slate-400">{s.body}</div>
              </div>
              <button
                onClick={() => removeSlide(s.id)}
                className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-600 dark:bg-red-950/30"
              >
                Sil
              </button>
            </div>
          ))}
          {slides.length === 0 && <div className="text-sm text-slate-400">Henüz slider görseli eklenmedi.</div>}
        </div>
      </div>

      {/* Hero metinleri ön izleme */}
      {heroPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5" onClick={() => setHeroPreviewOpen(false)}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl bg-paper2 dark:bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div className="text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">ÖN GÖSTERİM</div>
              <div className="text-lg font-extrabold text-slate-900 dark:text-white">Ziyaretçi ana sayfada bunu görecek</div>
            </div>
            <div className="bg-paper p-8 dark:bg-ink">
              <span className="inline-block rounded-full bg-[#010E80] px-3.5 py-1.5 text-xs font-bold text-white">
                {draftBlocks["hero.badge"] || "Rozet metni"}
              </span>
              <h1 className="mt-5 max-w-lg text-3xl font-extrabold leading-[1.1] tracking-tight text-slate-900 dark:text-white">
                {draftBlocks["hero.title"] || "Başlık metni"}
              </h1>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                {draftBlocks["hero.body"] || "Açıklama metni"}
              </p>
            </div>
            <div className="flex gap-2.5 border-t border-slate-200 p-5 dark:border-slate-800">
              <button
                onClick={publishHeroBlocks}
                className="flex-1 rounded-xl bg-[#010E80] py-3.5 text-sm font-extrabold text-white hover:bg-brand-hover"
              >
                Yayınla ve Kaydet
              </button>
              <button
                onClick={() => setHeroPreviewOpen(false)}
                className="rounded-xl bg-slate-100 px-5 py-3.5 text-sm font-bold text-slate-600 dark:bg-surface2 dark:text-slate-300"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni slayt ön izleme */}
      {slidePreviewOpen && pendingPreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5" onClick={() => setSlidePreviewOpen(false)}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl bg-paper2 dark:bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div className="text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">ÖN GÖSTERİM</div>
              <div className="text-lg font-extrabold text-slate-900 dark:text-white">Ziyaretçi ana sayfa slider'ında bunu görecek</div>
            </div>
            <div className="p-6">
              <div className="relative h-[260px] w-full overflow-hidden rounded-2xl bg-[#111827]">
                <img src={pendingPreviewUrl} alt={newSlide.title} className="h-full w-full object-cover" />
                {(newSlide.title || newSlide.body) && (
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/30 to-transparent p-5 pt-14">
                    {newSlide.title && <div className="text-lg font-extrabold text-white drop-shadow-md sm:text-xl">{newSlide.title}</div>}
                    {newSlide.body && <div className="mt-1 text-sm text-slate-100 drop-shadow-md">{newSlide.body}</div>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2.5 border-t border-slate-200 p-5 dark:border-slate-800">
              <button
                onClick={publishSlide}
                disabled={uploading}
                className="flex-1 rounded-xl bg-[#010E80] py-3.5 text-sm font-extrabold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {uploading ? "Yayınlanıyor…" : "Yayınla ve Kaydet"}
              </button>
              <button
                onClick={() => setSlidePreviewOpen(false)}
                className="rounded-xl bg-slate-100 px-5 py-3.5 text-sm font-bold text-slate-600 dark:bg-surface2 dark:text-slate-300"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

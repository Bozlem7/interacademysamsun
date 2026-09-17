import { useRef, useState } from "react";

const MAX_FILES = 5;
const PDF_MIME = "application/pdf";
const IMAGE_MIME_TO_JSPDF_FORMAT: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

type FileSource = "direct" | "converted";

function fileKey(file: File): string {
  return `${file.name}::${file.lastModified}::${file.size}`;
}

// Bazı işletim sistemi/tarayıcı kombinasyonlarında (özellikle Windows'ta dosya türü ilişkisi
// bozuk olan makinelerde) `File.type` boş string ("") veya "application/x-pdf" gibi standart
// dışı bir değer döndürebiliyor — yalnızca `type === PDF_MIME` kontrolü bu durumda geçerli bir
// PDF'i reddediyordu (yerelde çalışıp başka bir bilgisayarda çalışmama şikayetinin sebebi buydu).
// Dosya adı uzantısını da yedek olarak kontrol ediyoruz.
function isPdfFile(file: File): boolean {
  return file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel açılamadı, dosya bozuk olabilir"));
    img.src = src;
  });
}

// jsPDF (+ onun html2canvas/dompurify bağımlılıkları) tek başına ~400KB'lık ağır bir paket —
// sadece bu buton tıklanınca gerekli. Statik import ana bundle'ı büyütüp her sayfa girişinde
// (login ekranı dahil) indirtiyordu; dinamik import ile yalnızca gerçekten kullanılınca çekilir.
let jsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;
function loadJsPdf() {
  if (!jsPdfModulePromise) jsPdfModulePromise = import("jspdf");
  return jsPdfModulePromise;
}

/** Tek bir görseli, A4 sayfaya ortalanmış şekilde tek sayfalık bir PDF'e çevirir. */
async function convertImageToPdfFile(file: File): Promise<File> {
  const format = IMAGE_MIME_TO_JSPDF_FORMAT[file.type];
  if (!format) throw new Error(`Desteklenmeyen görsel türü: ${file.type || "bilinmiyor"}`);

  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImageElement(dataUrl);
  const { jsPDF } = await loadJsPdf();

  const orientation = img.width > img.height ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;

  pdf.addImage(dataUrl, format, (pageWidth - drawWidth) / 2, (pageHeight - drawHeight) / 2, drawWidth, drawHeight);

  const blob = pdf.output("blob");
  const pdfName = `${file.name.replace(/\.[^./\\]+$/, "")}.pdf`;
  return new File([blob], pdfName, { type: PDF_MIME, lastModified: Date.now() });
}

export function DocumentUploadField({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [sourceByKey, setSourceByKey] = useState<Record<string, FileSource>>({});
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingSlots = MAX_FILES - files.length;
  const disabled = isConverting || remainingSlots <= 0;

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError((current) => (current === message ? null : current)), 5000);
  }

  function appendFiles(incoming: File[], source: FileSource) {
    if (incoming.length === 0) return;
    const accepted = incoming.slice(0, Math.max(remainingSlots, 0));
    if (accepted.length < incoming.length) {
      showError(`En fazla ${MAX_FILES} dosya yükleyebilirsiniz, fazlası eklenmedi`);
    }
    if (accepted.length === 0) return;

    setSourceByKey((prev) => {
      const next = { ...prev };
      for (const f of accepted) next[fileKey(f)] = source;
      return next;
    });
    onChange([...files, ...accepted]);
  }

  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const selected = e.target.files ? Array.from(e.target.files) : [];
      const validPdfs = selected.filter(isPdfFile);
      if (validPdfs.length < selected.length) {
        showError("Sadece PDF (.pdf) dosyası seçebilirsiniz");
      }
      appendFiles(validPdfs, "direct");
    } catch (err) {
      console.error("[DocumentUploadField] PDF seçimi başarısız:", err);
      showError("PDF dosyası eklenirken bir hata oluştu");
    } finally {
      e.target.value = "";
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (selected.length === 0) return;

    const validImages = selected.filter((f) => Object.prototype.hasOwnProperty.call(IMAGE_MIME_TO_JSPDF_FORMAT, f.type));
    if (validImages.length < selected.length) {
      showError("Sadece JPG, PNG veya WEBP görseli seçebilirsiniz");
    }
    if (validImages.length === 0) return;

    setIsConverting(true);
    const converted: File[] = [];
    const failedNames: string[] = [];
    try {
      for (const image of validImages.slice(0, Math.max(remainingSlots, 0))) {
        try {
          converted.push(await convertImageToPdfFile(image));
        } catch (err) {
          console.error(`[DocumentUploadField] Görsel PDF'e çevrilemedi (${image.name}):`, err);
          failedNames.push(image.name);
        }
      }
      if (failedNames.length > 0) {
        showError(`Şu görseller PDF'e çevrilemedi: ${failedNames.join(", ")}`);
      }
      appendFiles(converted, "converted");
    } catch (err) {
      console.error("[DocumentUploadField] Görsel dönüştürme işlemi başarısız:", err);
      showError("Görsel PDF'e dönüştürülürken beklenmeyen bir hata oluştu");
    } finally {
      setIsConverting(false);
    }
  }

  function remove(index: number) {
    const removed = files[index];
    onChange(files.filter((_, i) => i !== index));
    if (removed) {
      setSourceByKey((prev) => {
        const next = { ...prev };
        delete next[fileKey(removed)];
        return next;
      });
    }
  }

  function swap(a: number, b: number) {
    if (b < 0 || b >= files.length) return;
    const next = [...files];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  }

  return (
    <div>
      <input
        ref={pdfInputRef}
        type="file"
        multiple
        accept="application/pdf"
        className="hidden"
        onChange={handlePdfSelect}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleImageSelect}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => pdfInputRef.current?.click()}
          disabled={disabled}
          className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
        >
          <div className="text-sm font-bold text-slate-600 dark:text-slate-300">📄 PDF Yükle</div>
          <div className="mt-1 text-[11px] text-slate-400">Hazır .pdf dosyasını doğrudan ekler</div>
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled}
          className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
        >
          <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
            {isConverting ? "⏳ Dönüştürülüyor…" : "🖼️ Görseli PDF'e Dönüştür"}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">JPG, PNG veya WEBP seçin, otomatik PDF'e çevrilir</div>
        </button>
      </div>

      <div className="mt-1.5 text-xs text-slate-400">
        {remainingSlots > 0 ? `En fazla ${MAX_FILES} dosya · ${remainingSlots} slot kaldı` : `En fazla ${MAX_FILES} dosya seçildi`}
      </div>

      {error && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {files.map((f, i) => {
            const source = sourceByKey[fileKey(f)];
            return (
              <div
                key={`${fileKey(f)}-${i}`}
                className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-lg dark:bg-surface2">
                  📄
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300" title={f.name}>
                    {i + 1}. {f.name}
                  </div>
                  <span
                    className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      source === "converted"
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                        : "bg-slate-100 text-slate-500 dark:bg-surface2 dark:text-slate-400"
                    }`}
                  >
                    {source === "converted" ? "Dönüştürülen PDF" : "Doğrudan PDF"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => swap(i, i - 1)}
                    disabled={i === 0}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 disabled:opacity-30 dark:bg-surface2 dark:text-slate-300"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => swap(i, i + 1)}
                    disabled={i === files.length - 1}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 disabled:opacity-30 dark:bg-surface2 dark:text-slate-300"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-950/30"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

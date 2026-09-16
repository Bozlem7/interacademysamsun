import { env } from "../../config/env";

function normalize(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, "");
}

const allowedOrigins = env.corsOrigins.map(normalize);
const allowAll = allowedOrigins.includes("*");

/**
 * express `cors()` / socket.io `cors.origin` uyumlu dinamik origin doğrulayıcı — statik bir
 * dizi yerine fonksiyon kullanılmasının nedeni, reddedilen origin'i sunucu loguna basabilmek.
 * Aksi halde tarayıcı isteği sessizce engelleniyor, axios `.response` içermeyen bir network
 * hatasıyla patlıyor ve "PDF yüklenemedi" gibi teşhis edilemeyen genel hatalara yol açıyor —
 * özellikle uzak bir bilgisayardan erişimde CORS_ORIGIN .env'de eksik/yanlış olduğunda.
 * Ayrıca http(s):// şema farkı dışında sondaki "/" ve büyük/küçük harf farklarını tolere eder.
 */
export function corsOriginHandler(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  // origin undefined: same-origin istek, curl/health check veya tarayıcı dışı istemci — engellenmez.
  if (!origin || allowAll) {
    callback(null, true);
    return;
  }

  if (allowedOrigins.includes(normalize(origin))) {
    callback(null, true);
    return;
  }

  console.warn(
    `[cors] Reddedilen origin: "${origin}" — izin verilen origin(ler): ${allowedOrigins.join(", ")}. ` +
      "Backend .env dosyasındaki CORS_ORIGIN değerini bu origin'i içerecek şekilde güncelleyin."
  );
  callback(null, false);
}

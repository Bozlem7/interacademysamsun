import { create } from "zustand";

/**
 * Header'daki "ÖN KAYIT BAŞVURU" butonu herhangi bir sayfadan tıklanabilir
 * (sadece anasayfada değil). Bu küçük store, header'ın "modalı aç" isteğini
 * anasayfaya taşımak için kullanılır: header `requestOpen()` çağırıp `/`'e
 * yönlendirir, HomePage bu flag'i görünce kendi modalını açar ve flag'i temizler.
 */
interface PreRegRequestState {
  requested: boolean;
  requestOpen: () => void;
  clear: () => void;
}

export const usePreRegRequestStore = create<PreRegRequestState>((set) => ({
  requested: false,
  requestOpen: () => set({ requested: true }),
  clear: () => set({ requested: false }),
}));

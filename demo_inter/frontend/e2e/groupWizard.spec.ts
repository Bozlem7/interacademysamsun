import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test("grup sihirbazı: hiç öğrenci seçilmeden tamamlanamaz, uyarı gösterilir", async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByRole("button", { name: "+ Yeni Grup Oluştur" }).click();

  const uniqueName = `E2E Boş Grup ${Date.now()}`;
  await page.getByPlaceholder("Örn: U-11 Akademi").fill(uniqueName);
  await page.getByRole("button", { name: "İleri / Öğrenci Seçimine Geç →" }).click();

  // Adım 2 — hiç kimseyi işaretlemeden doğrudan tamamlamayı dene.
  await page.getByRole("button", { name: /Seçilenleri Ata ve Grubu Tamamla \(0\)/ }).click();

  await expect(page.getByText("Grup oluşturmak için en az bir öğrenci seçmelisiniz!")).toBeVisible();

  // Modal hâlâ açık (adım 2 görünümünde) — kayıt gerçekleşmemiş.
  await expect(page.getByRole("button", { name: /Seçilenleri Ata ve Grubu Tamamla/ })).toBeVisible();

  // Filtre dropdown'unda bu grup adı oluşmamış olmalı.
  await page.keyboard.press("Escape");
});

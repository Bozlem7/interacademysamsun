import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test("çıkış yap: oturum tamamen temizlenir ve doğrudan anasayfaya yönlendirilir", async ({ page }) => {
  await loginAsAdmin(page);

  // Girişten sonra token localStorage'da olmalı.
  const authBefore = await page.evaluate(() => localStorage.getItem("inter-academy-auth"));
  expect(authBefore).toContain("token");

  await page.getByRole("button", { name: "Çıkış Yap" }).click();

  // Hiçbir ara ekran/onay olmadan doğrudan "/" adresine düşmeli.
  await expect(page).toHaveURL("http://localhost:5173/");

  // Auth state (token) temizlenmiş olmalı.
  const authAfter = await page.evaluate(() => localStorage.getItem("inter-academy-auth"));
  const parsed = authAfter ? JSON.parse(authAfter) : null;
  expect(parsed?.state?.token ?? null).toBeNull();

  // Header artık giriş yapılmamış haldeki şube butonlarını göstermeli.
  await expect(page.getByRole("button", { name: "Atakum Şubesi", exact: true })).toBeVisible();
});

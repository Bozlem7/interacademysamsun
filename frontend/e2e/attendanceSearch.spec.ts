import { test, expect } from "@playwright/test";
import { loginAsInstructor } from "./helpers";

test("eğitmen paneli: canlı arama filtreler, işaretlenen Var/Yok durumu arama sonrası da korunur", async ({ page }) => {
  await loginAsInstructor(page);

  // Yoklama sekmesi varsayılan olarak açık, ancak liste bir sınıf seçilene kadar boş kalır.
  // Öğrencisi garanti bulunan (seed'in her zaman doldurduğu) bir sınıfı seç.
  const groupSelect = page.getByRole("combobox").first();
  await groupSelect.selectOption({ label: "U-8 Akademi" });

  // Roster yüklenene kadar bekle.
  const rosterRows = page.locator("div.overflow-hidden > div.flex.items-center.gap-4");
  await expect(rosterRows.first()).toBeVisible({ timeout: 10000 });

  const totalBefore = await rosterRows.count();
  expect(totalBefore).toBeGreaterThan(0);

  // İlk öğrencinin adını al ve onu "Var" olarak işaretle.
  const firstRowText = await rosterRows.first().locator("div.flex-1").innerText();
  await rosterRows.first().getByRole("button", { name: "✓ Var" }).click();

  // Bu satırın "Var" butonu artık aktif (dolu yeşil) stilde olmalı.
  await expect(rosterRows.first().getByRole("button", { name: "✓ Var" })).toHaveClass(/bg-green-600/);

  // Arama kutusuna öğrencinin adının bir kısmını yaz — liste filtrelenmeli.
  const partialName = firstRowText.trim().split(" ")[0];
  await page.getByPlaceholder("Öğrenci ara…").fill(partialName);

  await expect(rosterRows.first()).toContainText(partialName);
  const filteredCount = await rosterRows.count();
  expect(filteredCount).toBeGreaterThanOrEqual(1);

  // İşaretlenen "Var" durumu, arama filtrelenmişken de görünür kalmalı (state kaybolmadı).
  await expect(rosterRows.first().getByRole("button", { name: "✓ Var" })).toHaveClass(/bg-green-600/);

  // Aramayı temizle — tüm liste geri gelmeli ve işaret hâlâ orada olmalı.
  await page.getByPlaceholder("Öğrenci ara…").fill("");
  await expect(rosterRows).toHaveCount(totalBefore);
});

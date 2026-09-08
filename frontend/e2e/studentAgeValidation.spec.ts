import { test, expect } from "@playwright/test";
import { loginAsAdmin, apiAdminLogin, apiDeleteStudent, generateValidTc } from "./helpers";

test("öğrenci kaydı: 5 yaşından küçük doğum yılı formu engeller", async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByRole("button", { name: "+ Yeni Öğrenci Kaydet" }).click();

  // Bayi seçimi zorunlu — hiçbir şube varsayılan olarak işaretli gelmez.
  await page.getByRole("button", { name: "Atakum", exact: true }).click();
  await page.getByPlaceholder("Adı Soyadı").fill("E2E Küçük Sporcu");
  await page.getByPlaceholder("TCKN").fill(generateValidTc(Date.now()));

  const tooYoungYear = new Date().getFullYear() - 3; // yaş = 3 < 5
  await page.locator('input[type="date"]').first().fill(`${tooYoungYear}-01-01`);

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("Sporcu yaşı en az 5 olmalıdır.")).toBeVisible();

  // Yaş kontrolü submit'ten önce, istemci tarafında engelliyor — API'ye hiç istek gitmedi,
  // dolayısıyla temizlenecek bir kayıt da yok.
});

test("öğrenci kaydı: tam 5 yaşındaki doğum yılı yaş uyarısı tetiklemez ve kayıt oluşturulur", async ({ page, request }) => {
  await loginAsAdmin(page);

  const fullName = `E2E Beş Yaşında Sporcu ${Date.now()}`;

  await page.getByRole("button", { name: "+ Yeni Öğrenci Kaydet" }).click();

  // Bayi seçimi zorunlu — hiçbir şube varsayılan olarak işaretli gelmez.
  await page.getByRole("button", { name: "Atakum", exact: true }).click();
  await page.getByPlaceholder("Adı Soyadı").fill(fullName);
  await page.getByPlaceholder("TCKN").fill(generateValidTc(Date.now() + 1));

  const exactlyFiveYear = new Date().getFullYear() - 5;
  await page.locator('input[type="date"]').first().fill(`${exactlyFiveYear}-01-01`);

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect(page.getByText("Sporcu yaşı en az 5 olmalıdır.")).not.toBeVisible();
  // Bu sefer form gerçekten kaydedildi — tablo satırında yeni öğrenci görünmeli.
  await expect(page.getByText(fullName)).toBeVisible();

  // Sonraki testleri kirletmemek için oluşturulan kaydı API'den bulup temizle.
  const { token } = await apiAdminLogin(request, "atakum");
  const res = await request.get("http://localhost:4000/api/students", { headers: { Authorization: `Bearer ${token}` } });
  const students = (await res.json()) as { id: string; fullName: string }[];
  const created = students.find((s) => s.fullName === fullName);
  if (created) await apiDeleteStudent(request, token, created.id);
});

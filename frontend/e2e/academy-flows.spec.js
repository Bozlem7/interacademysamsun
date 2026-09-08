// @ts-check
import { test, expect } from "@playwright/test";
import {
  BRANCH_NAME,
  VEZIRKOPRU_BRANCH_NAME,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  loginAsAdmin,
  loginAsInstructor,
  goToLoginForBranch,
  apiAdminLogin,
  apiGetBranches,
  apiGetGroups,
  apiCreateStudent,
  apiDeleteStudent,
  apiDeleteGroup,
} from "./helpers.js";

/**
 * academy-flows.spec.js
 *
 * Uçtan uca (E2E) kullanıcı akışları — şube izolasyonu, yönetici grup sihirbazı,
 * eğitmen not/yoklama akışı ve form validasyonları / oturum kapatma.
 *
 * Backend (http://localhost:4000) ve frontend (http://localhost:5173) dev sunucularının
 * önceden çalışıyor (ve backend'in `npm run seed` ile tohumlanmış) olması gerekir.
 *
 * Testler kendi test verisini API üzerinden oluşturur ve sonunda temizler — paylaşılan
 * seed verisine (öğrenci/grup sayısı vb.) bağımlı kalmadan, birbirinden izole çalışır.
 */

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

test.describe("1. Şube Giriş İzolasyonu", () => {
  /** @type {{ id: string; name: string; code: string }} */
  let atakumBranch;
  /** @type {{ id: string; tcNo: string }} */
  let student;
  /** @type {string} */
  let adminToken;

  test.beforeAll(async ({ request }) => {
    const login = await apiAdminLogin(request, "atakum");
    adminToken = login.token;
    const branches = await apiGetBranches(request);
    const found = branches.find((b) => b.code === "atakum");
    if (!found) throw new Error("Atakum şubesi bulunamadı");
    atakumBranch = found;
    student = await apiCreateStudent(request, adminToken, atakumBranch.id);
  });

  test.afterAll(async ({ request }) => {
    if (student) await apiDeleteStudent(request, adminToken, student.id);
  });

  test("Atakum'a kayıtlı veli, Vezirköprü kapısından giriş yapamaz ve uyarı görür", async ({ page }) => {
    await goToLoginForBranch(page, VEZIRKOPRU_BRANCH_NAME, "Veli Girişi");

    await page.getByPlaceholder("11 haneli numara").fill(student.tcNo);
    await page.getByRole("button", { name: "Giriş Yap" }).click();

    await expect(page.getByText("Yanlış bayiden giriş yapmaya çalışıyorsunuz.")).toBeVisible();

    // Oturum açılmamış — panele geçiş engellenmiş, hâlâ giriş formunda kalınmış olmalı.
    await expect(page).toHaveURL(/\/veli$/);
    const auth = await page.evaluate(() => localStorage.getItem("inter-academy-auth"));
    const parsed = auth ? JSON.parse(auth) : null;
    expect(parsed?.state?.token ?? null).toBeNull();
  });

  test("Aynı veli, doğru (Atakum) kapısından girince panele geçer ve Çıkış Yap belirir", async ({ page }) => {
    await goToLoginForBranch(page, BRANCH_NAME, "Veli Girişi");

    await page.getByPlaceholder("11 haneli numara").fill(student.tcNo);
    await page.getByRole("button", { name: "Giriş Yap" }).click();

    await expect(page).toHaveURL(/\/veli\/panel/);
    await expect(page.getByRole("button", { name: "Çıkış Yap" })).toBeVisible();
  });
});

test.describe("2. Yönetici Paneli & Grup Oluşturma Akışı", () => {
  /** @type {string} */
  let adminToken;
  /** @type {{ id: string; name: string; code: string }} */
  let atakumBranch;
  /** @type {{ id: string; tcNo: string }} */
  let studentA;
  /** @type {{ id: string; tcNo: string }} */
  let studentB;
  /** @type {string | null} */
  let createdGroupId = null;

  test.beforeAll(async ({ request }) => {
    const login = await apiAdminLogin(request, "atakum");
    adminToken = login.token;
    const branches = await apiGetBranches(request);
    const found = branches.find((b) => b.code === "atakum");
    if (!found) throw new Error("Atakum şubesi bulunamadı");
    atakumBranch = found;

    // Sihirbazın 2. adımında aranıp seçilecek, gruba atanmamış iki taze öğrenci.
    const tag = Date.now();
    studentA = await apiCreateStudent(request, adminToken, atakumBranch.id, { fullName: `E2E Sihirbaz Aday A ${tag}` });
    studentB = await apiCreateStudent(request, adminToken, atakumBranch.id, { fullName: `E2E Sihirbaz Aday B ${tag}` });
  });

  test.afterAll(async ({ request }) => {
    if (createdGroupId) await apiDeleteGroup(request, adminToken, createdGroupId);
    if (studentA) await apiDeleteStudent(request, adminToken, studentA.id);
    if (studentB) await apiDeleteStudent(request, adminToken, studentB.id);
  });

  test("mükerrer grup adı reddedilir, geçerli isimle 2 öğrenci seçilip grup oluşturulur ve filtre anında güncellenir", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Öğrenci Yönetimi" }).click();

    await page.getByRole("button", { name: "+ Yeni Grup Oluştur" }).click();

    // --- Adım 1: mevcut (seed'de her zaman var olan) bir grup adıyla mükerrerlik uyarısı ---
    await page.getByPlaceholder("Örn: U-11 Akademi").fill("U-11 Gelişim");
    await page.getByRole("button", { name: "İleri / Öğrenci Seçimine Geç →" }).click();
    await expect(page.getByText("Bu grup adı zaten mevcut! Lütfen farklı bir grup adı giriniz.")).toBeVisible();
    // Hâlâ adım 1'deyiz — isim alanı görünür olmalı.
    await expect(page.getByPlaceholder("Örn: U-11 Akademi")).toBeVisible();

    // --- Benzersiz isimle devam ---
    const uniqueGroupName = `E2E Akış Grubu ${Date.now()}`;
    await page.getByPlaceholder("Örn: U-11 Akademi").fill(uniqueGroupName);
    await page.getByRole("button", { name: "İleri / Öğrenci Seçimine Geç →" }).click();

    // --- Adım 2: hiç öğrenci seçmeden tamamlamayı dene → validasyon ---
    await page.getByRole("button", { name: /Seçilenleri Ata ve Grubu Tamamla \(0\)/ }).click();
    await expect(page.getByText("Grup oluşturmak için en az bir öğrenci seçmelisiniz!")).toBeVisible();

    // --- İki öğrenciyi arayıp seç --- (liste hem modalda hem arkadaki tabloda görünebildiği
    // için seçimi doğrudan sihirbazın öğrenci listesi kutusuyla sınırlıyoruz)
    const candidateList = page.locator("div.flex.max-h-72");
    await page.getByPlaceholder("İsim, soyisim ile ara…").fill("E2E Sihirbaz Aday");
    await expect(candidateList.getByText(studentA.fullName)).toBeVisible();
    await expect(candidateList.getByText(studentB.fullName)).toBeVisible();
    await candidateList.getByText(studentA.fullName).click();
    await candidateList.getByText(studentB.fullName).click();
    await expect(page.getByRole("button", { name: /Seçilenleri Ata ve Grubu Tamamla \(2\)/ })).toBeVisible();

    await page.getByRole("button", { name: /Seçilenleri Ata ve Grubu Tamamla \(2\)/ }).click();

    // Modal kapanmalı — kayıt tamamlandı.
    await expect(page.getByPlaceholder("Örn: U-11 Akademi")).not.toBeVisible();

    // Oluşan grubu hemen API'den de bul ve sakla — sonraki assertion'lardan biri patlasa bile
    // afterAll'daki temizlik bu id'yi bulup grubu silebilsin (test verisi sızdırmasın).
    const groups = await apiGetGroups(page.request, adminToken);
    const created = groups.find((g) => g.name === uniqueGroupName);
    expect(created).toBeTruthy();
    if (created) createdGroupId = created.id;

    // Filtre dropdown'ında yeni grup anında görünmeli.
    const groupFilterSelect = page.locator("select").first();
    await expect(groupFilterSelect.locator("option", { hasText: uniqueGroupName })).toHaveCount(1);

    // Öğrenci tablosunda, atanan öğrencilerin grup rozeti de anında güncellenmiş olmalı.
    await expect(page.locator("span", { hasText: uniqueGroupName }).first()).toBeVisible();
  });
});

test.describe("3. Eğitmen Not Verme & Yoklama Akışı", () => {
  /** @type {string} */
  let adminToken;
  /** @type {{ id: string; name: string; code: string }} */
  let atakumBranch;
  /** @type {{ id: string; name: string }} */
  let targetGroup;
  /** @type {{ id: string; fullName: string }} */
  let student;

  test.beforeAll(async ({ request }) => {
    const login = await apiAdminLogin(request, "atakum");
    adminToken = login.token;
    const branches = await apiGetBranches(request);
    const found = branches.find((b) => b.code === "atakum");
    if (!found) throw new Error("Atakum şubesi bulunamadı");
    atakumBranch = found;

    const groups = await apiGetGroups(request, adminToken);
    const group = groups.find((g) => g.name === "U-8 Akademi") ?? groups[0];
    if (!group) throw new Error("Atakum şubesinde hiç grup yok — seed çalıştırılmamış olabilir");
    targetGroup = group;

    const tag = Date.now();
    student = /** @type {any} */ (
      await apiCreateStudent(request, adminToken, atakumBranch.id, {
        fullName: `E2E Not Öğrencisi ${tag}`,
        groupId: targetGroup.id,
      })
    );
  });

  test.afterAll(async ({ request }) => {
    if (student) await apiDeleteStudent(request, adminToken, student.id);
  });

  test("sınıf seçilince öğrenci listesi dinamik dolar; ay + not girilip kaydedilince yeşil onay çıkar", async ({ page }) => {
    await loginAsInstructor(page);
    await page.getByRole("button", { name: "2. Öğrenciye Not Ekle" }).click();

    const groupSelect = page.getByRole("combobox").first();
    const studentSelect = page.getByRole("combobox").nth(1);

    // Sınıf seçilmeden öğrenci dropdown'ı devre dışı / boş olmalı.
    await expect(studentSelect).toBeDisabled();

    await groupSelect.selectOption({ label: targetGroup.name });

    // Sınıf seçildikten sonra dropdown aktifleşip o sınıfın öğrencisini içermeli.
    await expect(studentSelect).toBeEnabled();
    await expect(studentSelect.locator("option", { hasText: student.fullName })).toHaveCount(1);

    await studentSelect.selectOption({ label: student.fullName });

    // Değerlendirme dönemi: sadece ay ismi (gün alanı yok) — Ekim seçilsin.
    const periodSelects = page.getByRole("combobox").nth(2);
    await periodSelects.selectOption({ label: "Ekim" });
    await expect(periodSelects).toHaveValue("10");

    await page.getByPlaceholder("Değerlendirmenizi yazın…").fill("Ekim ayında saha içi disiplini gözle görülür şekilde arttı.");
    await page.getByRole("button", { name: "Notu Kaydet" }).click();

    await expect(page.getByText("Öğrenci değerlendirme notu başarıyla kaydedildi.")).toBeVisible();

    // Form temizlenmiş olmalı — not metni ve öğrenci seçimi sıfırlanır.
    await expect(page.getByPlaceholder("Değerlendirmenizi yazın…")).toHaveValue("");
  });
});

test.describe("4. Form Validasyonları ve Çıkış", () => {
  test("5 yaşından küçük doğum tarihiyle öğrenci kaydı engellenir ve yaş uyarısı çıkar", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Öğrenci Yönetimi" }).click();

    await page.getByRole("button", { name: "+ Yeni Öğrenci Kaydet" }).click();

    // Bayi seçimi zorunlu — hiçbir şube varsayılan olarak işaretli gelmez.
    await page.getByRole("button", { name: "Atakum", exact: true }).click();
    await page.getByPlaceholder("Adı Soyadı").fill("E2E Çok Küçük Sporcu");
    await page.getByPlaceholder("TCKN").fill("92710000784"); // yalnızca checksum formatı için — kayıt API'ye ulaşmıyor

    const tooYoungYear = new Date().getFullYear() - 3; // yaş = 3 < 5
    await page.locator('input[type="date"]').first().fill(`${tooYoungYear}-01-01`);

    await page.getByRole("button", { name: "Kaydet", exact: true }).click();

    await expect(page.getByText("Sporcu yaşı en az 5 olmalıdır.")).toBeVisible();
    // Form hâlâ açık — kayıt gerçekleşmemiş, modal kapanmamış.
    await expect(page.getByPlaceholder("Adı Soyadı")).toBeVisible();
  });

  test("Çıkış Yap: oturum anında sonlanır, / adresine döner ve panel verileri ekrandan kalkar", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText("Yönetici Paneli")).toBeVisible();

    await page.getByRole("button", { name: "Çıkış Yap" }).click();

    await expect(page).toHaveURL("http://localhost:5173/");
    await expect(page.getByText("Yönetici Paneli")).not.toBeVisible();

    const auth = await page.evaluate(() => localStorage.getItem("inter-academy-auth"));
    const parsed = auth ? JSON.parse(auth) : null;
    expect(parsed?.state?.token ?? null).toBeNull();

    // Header, giriş yapılmamış haldeki şube giriş butonlarını yeniden gösteriyor olmalı.
    await expect(page.getByRole("button", { name: `${BRANCH_NAME} Şubesi`, exact: true })).toBeVisible();
  });
});

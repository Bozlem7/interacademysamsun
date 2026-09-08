import { Page, APIRequestContext, expect } from "@playwright/test";

export const API_BASE = "http://localhost:4000/api";

export const BRANCH_NAME = "Atakum";
export const VEZIRKOPRU_BRANCH_NAME = "Vezirköprü";
export const ADMIN_USERNAME = "admin1";
export const ADMIN_PASSWORD = "inter_pass_10";
export const INSTRUCTOR_USERNAME = "muratkaya";
export const INSTRUCTOR_PASSWORD = "92710000784"; // seed'de TCKN = şifre

/** Anasayfadan bir şube seçip (dropdown açılır) ilgili rol girişine gider. */
export async function goToLogin(page: Page, roleLabel: "Yönetici Girişi" | "Eğitmen Girişi" | "Veli Girişi") {
  await goToLoginForBranch(page, BRANCH_NAME, roleLabel);
}

/** goToLogin'in şube seçilebilir hâli — izolasyon testleri farklı bir şubenin kapısından girmek ister. */
export async function goToLoginForBranch(
  page: Page,
  branchName: string,
  roleLabel: "Yönetici Girişi" | "Eğitmen Girişi" | "Veli Girişi"
) {
  await page.goto("/");
  await page.getByRole("button", { name: `${branchName} Şubesi` }).first().click();
  await page.getByRole("button", { name: roleLabel }).click();
}

export async function loginAsAdmin(page: Page) {
  await goToLogin(page, "Yönetici Girişi");
  await page.getByPlaceholder("admin1").fill(ADMIN_USERNAME);
  await page.getByPlaceholder("••••••••").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/yonetici\/panel/);
}

export async function loginAsInstructor(page: Page) {
  await goToLogin(page, "Eğitmen Girişi");
  await page.getByPlaceholder("Kullanıcı Adı").fill(INSTRUCTOR_USERNAME);
  await page.getByPlaceholder("Şifre").fill(INSTRUCTOR_PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/egitmen\/panel/);
}

/**
 * Seed'deki sabit TCKN'lere bağımlı kalmadan, backend'deki (tc.ts) ile aynı checksum
 * algoritmasıyla geçerli, tekil bir test TCKN'si üretir.
 */
export function generateValidTc(seed: number): string {
  const base = String(100000000 + ((seed * 7919) % 899999999)).padStart(9, "0");
  const digits = base.split("").map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  const d11 = (oddSum + evenSum + d10) % 10;
  return `${digits.join("")}${d10}${d11}`;
}

export async function apiAdminLogin(request: APIRequestContext, branchCode: "atakum" | "vezirkopru" = "atakum") {
  const res = await request.post(`${API_BASE}/auth/admin-login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD, branchCode },
  });
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<{ token: string; branch: { id: string; name: string; code: string } }>;
}

export async function apiGetBranches(request: APIRequestContext) {
  const res = await request.get(`${API_BASE}/branches`);
  return res.json() as Promise<{ id: string; name: string; code: string }[]>;
}

export async function apiGetGroups(request: APIRequestContext, token: string) {
  const res = await request.get(`${API_BASE}/groups`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json() as Promise<{ id: string; name: string }[]>;
}

/** API üzerinden, UI akışına dokunmadan test amaçlı bir öğrenci (ve dolayısıyla veli hesabı) oluşturur. */
export async function apiCreateStudent(
  request: APIRequestContext,
  token: string,
  branchId: string,
  overrides: Record<string, unknown> = {}
) {
  const seed = Date.now() + Math.floor(Math.random() * 100000);
  const tcNo = generateValidTc(seed);
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 10);

  const res = await request.post(`${API_BASE}/students`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      branchId,
      fullName: `E2E Akış Öğrencisi ${seed}`,
      tcNo,
      dob: dob.toISOString().slice(0, 10),
      paymentDueDay: 15,
      ...overrides,
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { ...(body as Record<string, unknown>), id: (body as any).id as string, tcNo };
}

export async function apiDeleteStudent(request: APIRequestContext, token: string, id: string) {
  await request.delete(`${API_BASE}/students/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function apiDeleteGroup(request: APIRequestContext, token: string, id: string) {
  await request.delete(`${API_BASE}/groups/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

import { Prisma, StaffSpecialty } from "@prisma/client";
import { ForbiddenError } from "../../common/errors/AppError";

/** Şubeden bağımsız (ortak havuz) çalışan uzmanlık türleri. */
export const SHARED_SPECIALTIES: StaffSpecialty[] = ["diyetisyen", "psikolog"];

export const isSharedSpecialty = (s: StaffSpecialty) => SHARED_SPECIALTIES.includes(s);

/** Kaydın yazılacağı branchId: ortak uzman → null, antrenör → oturumdaki aktif şube. */
export const resolveStaffBranchId = (specialty: StaffSpecialty, activeBranchId: string) =>
  isSharedSpecialty(specialty) ? null : activeBranchId;

/** Aktif şubenin görebileceği personel: kendi şubesi + ortak havuz. */
export const staffVisibleTo = (branchId: string): Prisma.StaffProfileWhereInput => ({
  OR: [{ branchId }, { branchId: null }],
});

/** Tekil kayıt erişim kontrolü (detay/PUT/DELETE için). */
export function assertStaffAccessible(profile: { branchId: string | null }, activeBranchId: string) {
  if (profile.branchId !== null && profile.branchId !== activeBranchId) {
    throw new ForbiddenError("Bu personel farklı bir şubeye ait");
  }
}

import { prisma } from "../../config/prisma";
import { verifyPassword } from "../../common/security/password";
import { hashTc, isValidTc } from "../../common/security/tc";
import { signToken } from "../../common/security/jwt";
import { resolveBranchByCode } from "../branches/branches.service";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";

const WRONG_BRANCH_MESSAGE = "Yanlış bayiden giriş yapmaya çalışıyorsunuz.";

export async function loginStaffOrAdmin(username: string, password: string, branchCode: string) {
  const branch = await resolveBranchByCode(branchCode);

  const user = await prisma.user.findUnique({
    where: { username },
    include: { staffProfile: true },
  });
  if (!user || !user.isActive) throw new UnauthorizedError("Kullanıcı adı veya şifre hatalı");
  if (user.role !== "yonetici" && user.role !== "egitmen") {
    throw new UnauthorizedError("Bu giriş formu bu hesap türü için geçerli değil");
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new UnauthorizedError("Kullanıcı adı veya şifre hatalı");

  // Yonetici global bir hesaptır — herhangi bir şube kodundan giriş yapıp o şubeyi
  // "aktif" olarak seçebilir. Eğitmen ise sadece kendi kayıtlı olduğu şubeden girebilir.
  if (user.role === "egitmen") {
    if (!user.staffProfile || user.staffProfile.branchId !== branch.id) {
      throw new ForbiddenError(WRONG_BRANCH_MESSAGE);
    }
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    staffId: user.staffProfile?.id,
    branchId: branch.id,
    branchCode: branch.code,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.staffProfile?.fullName ?? user.username,
      specialty: user.staffProfile?.specialty ?? null,
    },
    branch: { id: branch.id, name: branch.name, code: branch.code },
  };
}

export async function loginParent(tcNo: string, branchCode: string) {
  if (!isValidTc(tcNo)) throw new ValidationError("Geçersiz TC kimlik numarası");
  const branch = await resolveBranchByCode(branchCode);

  const tcHash = hashTc(tcNo);
  const student = await prisma.student.findUnique({
    where: { tcNoHash: tcHash },
    include: { parentUser: true, group: true },
  });
  if (!student || !student.parentUser || !student.parentUser.isActive) {
    throw new UnauthorizedError("TC kimlik numarası ile eşleşen kayıt bulunamadı");
  }

  if (student.branchId !== branch.id) {
    throw new ForbiddenError(WRONG_BRANCH_MESSAGE);
  }

  const ok = await verifyPassword(student.parentUser.passwordHash, tcNo);
  if (!ok) throw new UnauthorizedError("TC kimlik numarası ile eşleşen kayıt bulunamadı");

  const token = signToken({
    sub: student.parentUser.id,
    role: "veli",
    studentId: student.id,
    branchId: branch.id,
    branchCode: branch.code,
  });

  return {
    token,
    student: {
      id: student.id,
      fullName: stripSeedTag(student.fullName),
      group: student.group?.name ?? null,
    },
    branch: { id: branch.id, name: branch.name, code: branch.code },
  };
}

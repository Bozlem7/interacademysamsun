import { prisma } from "../../config/prisma";
import { ValidationError } from "../../common/errors/AppError";

export async function resolveBranchByCode(branchCode: string) {
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  if (!branch) throw new ValidationError("Geçersiz şube seçimi");
  return branch;
}

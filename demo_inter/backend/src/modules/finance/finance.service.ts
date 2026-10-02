import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ConflictError, NotFoundError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";

const userName = { select: { username: true, staffProfile: { select: { fullName: true } } } } as const;

const transactionInclude = {
  creator: userName,
  updater: userName,
  deleter: userName,
  student: { select: { fullName: true } },
} satisfies Prisma.FinanceTransactionInclude;

type TransactionWithRelations = Prisma.FinanceTransactionGetPayload<{ include: typeof transactionInclude }>;

function displayName(user: { username: string; staffProfile: { fullName: string } | null } | null) {
  return user ? (user.staffProfile?.fullName ?? user.username) : null;
}

function toTransactionView(r: TransactionWithRelations) {
  return {
    id: r.id,
    type: r.type,
    description: r.description,
    amount: r.amount,
    category: r.category,
    transactionDate: r.transactionDate,
    paymentId: r.paymentId,
    studentName: r.student ? stripSeedTag(r.student.fullName) : null,
    createdByName: displayName(r.creator),
    createdAt: r.createdAt,
    updatedByName: displayName(r.updater),
    updatedAt: r.updatedAt,
    previousAmount: r.previousAmount,
    isDeleted: r.isDeleted,
    deletedByName: displayName(r.deleter),
    deletedAt: r.deletedAt,
  };
}

export async function createExpense(input: {
  description: string;
  amount: number;
  category?: string;
  expenseDate?: Date;
  createdBy: string;
}) {
  return prisma.financeTransaction.create({
    data: {
      type: "gider",
      description: input.description,
      amount: input.amount,
      category: input.category,
      transactionDate: input.expenseDate ?? new Date(),
      createdBy: input.createdBy,
    },
  });
}

export async function createManualIncome(input: {
  description: string;
  amount: number;
  category?: string;
  incomeDate?: Date;
  createdBy: string;
}) {
  return prisma.financeTransaction.create({
    data: {
      type: "gelir",
      description: input.description,
      amount: input.amount,
      category: input.category,
      transactionDate: input.incomeDate ?? new Date(),
      createdBy: input.createdBy,
    },
  });
}

export async function getFinanceSummary(params: { from?: Date; to?: Date }) {
  const dateFilter = params.from || params.to ? { gte: params.from, lte: params.to } : undefined;

  const grouped = await prisma.financeTransaction.groupBy({
    by: ["type"],
    // Soft-delete edilmiş kayıtlar (ör. "Geri Al" ile iptal edilen aidat tahsilatı) kasaya dahil değil.
    where: { isDeleted: false, transactionDate: dateFilter },
    _sum: { amount: true },
  });

  const totalIncome = Number(grouped.find((g) => g.type === "gelir")?._sum.amount ?? 0);
  const totalExpense = Number(grouped.find((g) => g.type === "gider")?._sum.amount ?? 0);

  return {
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
  };
}

export async function listFinanceTransactions(params: {
  type?: "gelir" | "gider";
  from?: Date;
  to?: Date;
  search?: string;
  page: number;
  pageSize: number;
}) {
  const contains = params.search ? { contains: params.search, mode: "insensitive" as const } : undefined;
  const where: Prisma.FinanceTransactionWhereInput = {
    isDeleted: false,
    type: params.type,
    transactionDate: params.from || params.to ? { gte: params.from, lte: params.to } : undefined,
    ...(contains
      ? { OR: [{ description: contains }, { category: contains }, { student: { fullName: contains } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.financeTransaction.count({ where }),
  ]);

  return { total, page: params.page, pageSize: params.pageSize, items: rows.map(toTransactionView) };
}

/** Aidat tahsilatından türeyen gelirler Payment ile senkron kalmalı — tek düzeltme yolu "Geri Al". */
async function findEditableTransaction(id: string) {
  const existing = await prisma.financeTransaction.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new NotFoundError("İşlem kaydı bulunamadı");
  if (existing.paymentId) {
    throw new ConflictError(
      "Öğrenci aidat tahsilatları buradan değiştirilemez; Ödeme & WhatsApp sekmesindeki \"Geri Al\" ile düzeltin."
    );
  }
  return existing;
}

export async function updateFinanceTransaction(
  id: string,
  input: { description?: string; amount?: number; category?: string | null; transactionDate?: Date },
  updatedBy: string
) {
  const existing = await findEditableTransaction(id);

  // isDeleted koşullu update: kontrol ile yazma arasında kayıt silinmişse düzenleme uygulanmaz.
  const { count } = await prisma.financeTransaction.updateMany({
    where: { id, isDeleted: false },
    data: { ...input, previousAmount: existing.amount, updatedBy, updatedAt: new Date() },
  });
  if (count === 0) throw new NotFoundError("İşlem kaydı bulunamadı");

  const updated = await prisma.financeTransaction.findUniqueOrThrow({ where: { id }, include: transactionInclude });
  return toTransactionView(updated);
}

export async function softDeleteFinanceTransaction(id: string, deletedBy: string) {
  await findEditableTransaction(id);

  const { count } = await prisma.financeTransaction.updateMany({
    where: { id, isDeleted: false },
    data: { isDeleted: true, deletedBy, deletedAt: new Date() },
  });
  if (count === 0) throw new NotFoundError("İşlem kaydı bulunamadı");
}

/**
 * "Son İşlemler & Detaylar" akışı: her kaydın yaşam döngüsü zaman damgalarından (eklenme,
 * son düzenleme, silinme) olay listesi türetilir — ayrı bir log tablosu gerekmez. Her olay
 * türünün en yeni `limit` kaydı alınıp birleştirildiği için genel sıralamanın ilk `limit`
 * olayı her zaman eksiksizdir. Silinmiş kayıtlar burada görünmeye devam eder.
 */
export async function getFinanceAuditLog(limit: number) {
  const [created, updated, deleted] = await Promise.all([
    prisma.financeTransaction.findMany({ include: transactionInclude, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.financeTransaction.findMany({
      where: { updatedAt: { not: null } },
      include: transactionInclude,
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.financeTransaction.findMany({
      where: { deletedAt: { not: null } },
      include: transactionInclude,
      orderBy: { deletedAt: "desc" },
      take: limit,
    }),
  ]);

  const event = (r: TransactionWithRelations, action: "eklendi" | "guncellendi" | "silindi", at: Date, actor: string | null) => ({
    id: `${r.id}:${action}`,
    action,
    at,
    actorName: actor ?? "bilinmiyor",
    transaction: toTransactionView(r),
  });

  return [
    ...created.map((r) => event(r, "eklendi", r.createdAt, displayName(r.creator))),
    ...updated.map((r) => event(r, "guncellendi", r.updatedAt!, displayName(r.updater))),
    ...deleted.map((r) => event(r, "silindi", r.deletedAt!, displayName(r.deleter))),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

import { prisma } from "../../config/prisma";
import { stripSeedTag } from "../../common/text/displayName";

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
    where: dateFilter ? { transactionDate: dateFilter } : undefined,
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

function resolveCreatorName(creator: { username: string; staffProfile: { fullName: string } | null }) {
  return creator.staffProfile?.fullName ?? creator.username;
}

export async function listFinanceTransactions(params: {
  type?: "gelir" | "gider";
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}) {
  const where = {
    type: params.type,
    transactionDate: params.from || params.to ? { gte: params.from, lte: params.to } : undefined,
  };

  const [rows, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      include: {
        creator: { select: { username: true, staffProfile: { select: { fullName: true } } } },
        student: { select: { fullName: true } },
      },
      orderBy: { transactionDate: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.financeTransaction.count({ where }),
  ]);

  return {
    total,
    page: params.page,
    pageSize: params.pageSize,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description,
      amount: r.amount,
      category: r.category,
      transactionDate: r.transactionDate,
      studentName: r.student ? stripSeedTag(r.student.fullName) : null,
      createdByName: resolveCreatorName(r.creator),
    })),
  };
}


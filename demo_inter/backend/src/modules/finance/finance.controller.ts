import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import * as service from "./finance.service";

const expenseSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
  category: z.string().trim().min(1).optional(),
  expenseDate: z.coerce.date().optional(),
});

const incomeSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
  category: z.string().trim().min(1).optional(),
  incomeDate: z.coerce.date().optional(),
});

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

expensesRouter.post("/", requireRole("yonetici"), validateBody(expenseSchema), async (req, res) => {
  const expense = await service.createExpense({ ...req.body, createdBy: req.auth!.sub });
  res.status(201).json(expense);
});

export const incomesRouter = Router();
incomesRouter.use(requireAuth);

incomesRouter.post("/", requireRole("yonetici"), validateBody(incomeSchema), async (req, res) => {
  const income = await service.createManualIncome({ ...req.body, createdBy: req.auth!.sub });
  res.status(201).json(income);
});

export const financeRouter = Router();
financeRouter.use(requireAuth);
financeRouter.use(requireRole("yonetici"));

financeRouter.get("/summary", async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const summary = await service.getFinanceSummary({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  res.json(summary);
});

financeRouter.get("/transactions", async (req, res) => {
  const { from, to, type, page, pageSize } = req.query as Record<string, string>;
  const result = await service.listFinanceTransactions({
    type: type === "gelir" || type === "gider" ? type : undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    page: page ? Math.max(1, Number(page)) : 1,
    pageSize: pageSize ? Math.min(100, Math.max(1, Number(pageSize))) : 20,
  });
  res.json(result);
});

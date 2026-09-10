import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError, NotFoundError } from "../../common/errors/AppError";
import * as service from "./payments.service";

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

paymentsRouter.get("/", async (req, res) => {
  const { periodYear, periodMonth, status } = req.query as Record<string, string>;
  const { role, studentId, branchId } = req.auth!;

  if (role === "egitmen") throw new ForbiddenError();

  const filters: any = {
    periodYear: periodYear ? Number(periodYear) : undefined,
    periodMonth: periodMonth ? Number(periodMonth) : undefined,
    status,
    branchId,
  };
  if (role === "veli") filters.studentId = studentId;

  res.json(await service.listPayments(filters));
});

const markPaidSchema = z.object({ confirm: z.literal(true) });

paymentsRouter.patch("/:id/status", requireRole("yonetici"), validateBody(markPaidSchema), async (req, res) => {
  const existing = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { student: true } });
  if (!existing) throw new NotFoundError("Ödeme kaydı bulunamadı");
  if (existing.student.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu ödeme farklı bir şubeye ait");

  const payment = await service.markPaymentPaid(req.params.id, req.auth!.sub, req.body.confirm);
  res.json(payment);
});

paymentsRouter.post("/generate-period", requireRole("yonetici"), async (_req, res) => {
  res.json(await service.generateMonthlyPayments());
});

paymentsRouter.post("/run-overdue-check", requireRole("yonetici"), async (_req, res) => {
  res.json(await service.runOverdueNotificationCheck());
});

paymentsRouter.post("/:id/remind", requireRole("yonetici"), async (req, res) => {
  const payment = await service.sendManualPaymentReminder(req.params.id);
  res.json({ success: true, message: "Hatırlatma mesajı başarıyla gönderildi.", lastReminderDate: payment.lastReminderDate });
});

export const feeSettingsRouter = Router();
feeSettingsRouter.use(requireAuth);

feeSettingsRouter.get("/", async (_req, res) => {
  const settings = await prisma.feeSettings.upsert({
    where: { id: 1 },
    create: { id: 1, monthlyFee: 3500 },
    update: {},
  });
  res.json(settings);
});

const feeSchema = z.object({ monthlyFee: z.number().positive() });

feeSettingsRouter.put("/", requireRole("yonetici"), validateBody(feeSchema), async (req, res) => {
  const settings = await prisma.feeSettings.upsert({
    where: { id: 1 },
    create: { id: 1, monthlyFee: req.body.monthlyFee, updatedBy: req.auth!.sub },
    update: { monthlyFee: req.body.monthlyFee, updatedBy: req.auth!.sub },
  });
  res.json(settings);
});

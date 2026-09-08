import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../common/middleware/validate";
import { loginParent, loginStaffOrAdmin } from "./auth.service";

export const authRouter = Router();

const staffLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  branchCode: z.string().min(1),
});

authRouter.post("/staff-login", validateBody(staffLoginSchema), async (req, res) => {
  const result = await loginStaffOrAdmin(req.body.username, req.body.password, req.body.branchCode);
  res.json(result);
});

authRouter.post("/admin-login", validateBody(staffLoginSchema), async (req, res) => {
  const result = await loginStaffOrAdmin(req.body.username, req.body.password, req.body.branchCode);
  res.json(result);
});

const parentLoginSchema = z.object({
  tcNo: z.string().min(11).max(11),
  branchCode: z.string().min(1),
});

authRouter.post("/parent-login", validateBody(parentLoginSchema), async (req, res) => {
  const result = await loginParent(req.body.tcNo, req.body.branchCode);
  res.json(result);
});

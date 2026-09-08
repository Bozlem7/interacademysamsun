import { Router } from "express";
import { prisma } from "../../config/prisma";

// Public — giriş ekranlarında ve ön kayıt formunda şube seçimi için kullanılır.
export const branchesRouter = Router();

branchesRouter.get("/", async (_req, res) => {
  res.json(await prisma.branch.findMany({ orderBy: { name: "asc" } }));
});

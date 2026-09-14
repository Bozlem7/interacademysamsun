import { Router } from "express";
import { requireAuth, requireRole } from "../../common/middleware/auth";

// WPPConnect/Puppeteer istemcisi proje kökünde düz JS olarak yazıldı (bkz. services/whatsappClient.js).
const whatsappClient = require("../../../services/whatsappClient");

export const whatsappRouter = Router();

whatsappRouter.use(requireAuth, requireRole("yonetici"));

whatsappRouter.get("/status", (_req, res) => {
  res.json(whatsappClient.getState());
});

whatsappRouter.post("/reconnect", async (_req, res) => {
  await whatsappClient.requestReconnect();
  res.json(whatsappClient.getState());
});

whatsappRouter.post("/logout", async (_req, res) => {
  await whatsappClient.logoutSession();
  res.json(whatsappClient.getState());
});

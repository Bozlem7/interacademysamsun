const express = require("express");
const { remindPayment } = require("../controllers/paymentController");
// Prod'da (node dist/server.js) derlenmis JS'i, dev'de (tsx) TS kaynagini kullan.
let authMiddleware;
try {
  authMiddleware = require("../dist/common/middleware/auth");
} catch {
  authMiddleware = require("../src/common/middleware/auth");
}
const { requireAuth, requireRole } = authMiddleware;

const router = express.Router();

router.post("/:id/remind", requireAuth, requireRole("yonetici"), remindPayment);

module.exports = router;

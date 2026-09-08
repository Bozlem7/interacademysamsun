const express = require("express");
const { remindPayment } = require("../controllers/paymentController");
const { requireAuth, requireRole } = require("../src/common/middleware/auth");

const router = express.Router();

router.post("/:id/remind", requireAuth, requireRole("yonetici"), remindPayment);

module.exports = router;

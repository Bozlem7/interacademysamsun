const express = require("express");
const { saveAttendanceAndNotify } = require("../controllers/attendanceController");

const router = express.Router();

router.post("/save", saveAttendanceAndNotify);

module.exports = router;

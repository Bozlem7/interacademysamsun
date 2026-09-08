import { Router } from "express";
import { authRouter } from "../modules/auth/auth.controller";
import { branchesRouter } from "../modules/branches/branches.controller";
import { studentsRouter } from "../modules/students/students.controller";
import { groupsRouter } from "../modules/groups/groups.controller";
import { staffRouter } from "../modules/staff/staff.controller";
import { adminInstructorsRouter } from "../modules/staff/adminInstructors.controller";
import { instructorStudentsRouter } from "../modules/instructorStudents/instructorStudents.controller";
import { attendanceRouter } from "../modules/attendance/attendance.controller";
import { notesRouter } from "../modules/notes/notes.controller";
import { paymentsRouter, feeSettingsRouter } from "../modules/payments/payments.controller";
import { preRegistrationsRouter } from "../modules/preRegistrations/preRegistrations.controller";
import { scheduleRouter } from "../modules/schedule/schedule.controller";
import { contentRouter } from "../modules/content/content.controller";
import { announcementsRouter } from "../modules/announcements/announcements.controller";
import { uploadsRouter } from "../modules/uploads/uploads.controller";

// WPPConnect ile anlık "Hatırlat" ucu (bkz. controllers/paymentController.js) — TS
// derlemesinin (rootDir: src) dışındaki düz JS router'ı require() ile ekleniyor.
const paymentReminderRoutes = require("../../routes/paymentRoutes");
// WPPConnect ile yoklama kaydet + devamsiz veli bildirimi (bkz. controllers/attendanceController.js)
const attendanceWppRoutes = require("../../routes/attendanceRoutes");

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/branches", branchesRouter);
apiRouter.use("/students", studentsRouter);
apiRouter.use("/groups", groupsRouter);
apiRouter.use("/staff", staffRouter);
apiRouter.use("/admin/instructors", adminInstructorsRouter);
apiRouter.use("/instructor-students", instructorStudentsRouter);
apiRouter.use("/attendance", attendanceRouter);
apiRouter.use("/attendance", attendanceWppRoutes);
apiRouter.use("/notes", notesRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/payments", paymentReminderRoutes);
apiRouter.use("/fee-settings", feeSettingsRouter);
apiRouter.use("/pre-registrations", preRegistrationsRouter);
apiRouter.use("/schedule", scheduleRouter);
apiRouter.use("/content", contentRouter);
apiRouter.use("/announcements", announcementsRouter);
apiRouter.use("/uploads", uploadsRouter);

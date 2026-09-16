import { Router } from "express";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { UnauthorizedError } from "../../common/errors/AppError";
import { getStudentAttendanceReport } from "../attendance/attendanceReport.service";

export const parentRouter = Router();

parentRouter.use(requireAuth, requireRole("veli"));

// Öğrenci kimliği HİÇBİR ZAMAN istekten (query/body/param) alınmaz — yalnızca giriş sırasında
// sunucu tarafında TC ile doğrulanıp JWT'ye gömülen req.auth.studentId kullanılır (bkz.
// auth.service.ts::loginParent). Bu sayede bir veli, URL/parametre değiştirerek başka bir
// öğrencinin yoklama verisine asla erişemez (IDOR koruması JWT imzasıyla garanti edilir).
parentRouter.get("/attendance-report", async (req, res) => {
  const { studentId } = req.auth!;
  if (!studentId) throw new UnauthorizedError("Veli oturumunda öğrenci kimliği bulunamadı");
  res.json(await getStudentAttendanceReport(studentId));
});

import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";

export type LessonType = "antrenman" | "diyetisyen" | "psikolog";

// TrainingSession.sessionType (saha/diyet/psikolog) -> rapordaki ders_turu etiketi.
// attendance.controller.ts'deki DERS_TURU_LABELS ile aynı eşleme; sessionId boşsa (normal
// yoklama akışında olduğu gibi) varsayılan olarak "antrenman" kabul edilir.
const SESSION_TYPE_TO_LESSON: Record<string, LessonType> = {
  saha: "antrenman",
  diyet: "diyetisyen",
  psikolog: "psikolog",
};

interface LessonTypeStat {
  attended: number;
  total: number;
}

export interface AttendanceReportRow {
  date: string;
  lessonType: LessonType;
  status: "geldi" | "gelmedi";
  notes: string | null;
}

export interface AttendanceReport {
  studentId: string;
  studentName: string;
  summary: {
    totalSessions: number;
    attended: number;
    absent: number;
    byLessonType: Record<LessonType, LessonTypeStat>;
  };
  history: AttendanceReportRow[];
}

export async function getStudentAttendanceReport(studentId: string): Promise<AttendanceReport> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId },
    include: { session: true },
    orderBy: { sessionDate: "desc" },
  });

  const byLessonType: Record<LessonType, LessonTypeStat> = {
    antrenman: { attended: 0, total: 0 },
    diyetisyen: { attended: 0, total: 0 },
    psikolog: { attended: 0, total: 0 },
  };
  let attended = 0;
  let absent = 0;

  const history: AttendanceReportRow[] = records.map((r) => {
    const lessonType = r.session ? SESSION_TYPE_TO_LESSON[r.session.sessionType] ?? "antrenman" : "antrenman";
    const wasPresent = r.status === "var";

    if (wasPresent) attended++;
    else absent++;
    byLessonType[lessonType].total++;
    if (wasPresent) byLessonType[lessonType].attended++;

    return {
      date: r.sessionDate.toISOString().slice(0, 10),
      lessonType,
      status: wasPresent ? "geldi" : "gelmedi",
      notes: r.notes,
    };
  });

  return {
    studentId,
    studentName: stripSeedTag(student.fullName),
    summary: {
      totalSessions: records.length,
      attended,
      absent,
      byLessonType,
    },
    history,
  };
}

import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";

export type LessonType = "antrenman" | "diyetisyen" | "psikolog";
export type AttendanceRowStatus = "geldi" | "gelmedi" | "izinli";

// TrainingSession.sessionType (saha/diyet/psikolog) -> rapordaki ders_turu etiketi.
// attendance.controller.ts'deki DERS_TURU_LABELS ile aynı eşleme; sessionId boşsa (normal
// yoklama akışında olduğu gibi) varsayılan olarak "antrenman" kabul edilir.
const SESSION_TYPE_TO_LESSON: Record<string, LessonType> = {
  saha: "antrenman",
  diyet: "diyetisyen",
  psikolog: "psikolog",
};

// DB'deki AttendanceStatus enum'u (var/yok/izinli) -> rapordaki okunabilir durum etiketi.
const DB_STATUS_TO_ROW_STATUS: Record<string, AttendanceRowStatus> = {
  var: "geldi",
  yok: "gelmedi",
  izinli: "izinli",
};

interface LessonTypeStat {
  attended: number;
  total: number;
}

export interface AttendanceReportRow {
  date: string;
  lessonType: LessonType;
  status: AttendanceRowStatus;
  groupName: string | null;
  markedByName: string | null;
  notes: string | null;
}

export interface AttendanceReport {
  studentId: string;
  studentName: string;
  summary: {
    totalSessions: number;
    attended: number;
    absent: number;
    excused: number;
    /** Katıldığı ders / toplam ders, yüzde olarak (0-100, tam sayıya yuvarlanmış). */
    attendanceRate: number;
    byLessonType: Record<LessonType, LessonTypeStat>;
  };
  history: AttendanceReportRow[];
}

export async function getStudentAttendanceReport(studentId: string): Promise<AttendanceReport> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { group: true } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");

  const records = await prisma.attendanceRecord.findMany({
    where: { studentId },
    include: {
      session: { include: { group: true } },
      marker: { include: { staffProfile: true } },
    },
    orderBy: { sessionDate: "desc" },
  });

  const byLessonType: Record<LessonType, LessonTypeStat> = {
    antrenman: { attended: 0, total: 0 },
    diyetisyen: { attended: 0, total: 0 },
    psikolog: { attended: 0, total: 0 },
  };
  let attended = 0;
  let absent = 0;
  let excused = 0;

  const history: AttendanceReportRow[] = records.map((r) => {
    const lessonType = r.session ? SESSION_TYPE_TO_LESSON[r.session.sessionType] ?? "antrenman" : "antrenman";
    const status = DB_STATUS_TO_ROW_STATUS[r.status] ?? "gelmedi";

    if (status === "geldi") attended++;
    else if (status === "izinli") excused++;
    else absent++;
    byLessonType[lessonType].total++;
    if (status === "geldi") byLessonType[lessonType].attended++;

    return {
      date: r.sessionDate.toISOString().slice(0, 10),
      lessonType,
      status,
      groupName: r.session?.group?.name ?? student.group?.name ?? null,
      markedByName: r.marker?.staffProfile?.fullName ?? r.marker?.username ?? null,
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
      excused,
      attendanceRate: records.length > 0 ? Math.round((attended / records.length) * 100) : 0,
      byLessonType,
    },
    history,
  };
}

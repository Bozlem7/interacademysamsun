import { z } from "zod";
import { tcNoSchema } from "../../common/security/tc";

interface ContactFields {
  motherPhone?: string;
  fatherPhone?: string;
  emergencyPhone?: string;
  notifyMother?: boolean;
  notifyFather?: boolean;
  notifyGuardian?: boolean;
}

/**
 * Anne/baba/vasi-yakın telefon + bildirim çiftlerini doğrular:
 * 1) üç telefondan en az biri dolu olmalı,
 * 2) telefonu boş olan biri "bildirim gönder" olarak işaretlenemez (frontend zaten disabled
 *    bırakır, burada savunma amaçlı tekrar kontrol ediyoruz),
 * 3) telefonu dolu olanlardan en az birinin bildirim kutusu işaretli olmalı.
 */
function validateContacts(data: ContactFields, ctx: z.RefinementCtx) {
  const hasMother = Boolean(data.motherPhone?.trim());
  const hasFather = Boolean(data.fatherPhone?.trim());
  const hasGuardian = Boolean(data.emergencyPhone?.trim());

  if (!hasMother && !hasFather && !hasGuardian) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "En az bir iletişim numarası girilmelidir", path: ["motherPhone"] });
    return;
  }

  if (data.notifyMother && !hasMother) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Telefonu olmayan bir kişi için bildirim seçilemez", path: ["notifyMother"] });
  }
  if (data.notifyFather && !hasFather) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Telefonu olmayan bir kişi için bildirim seçilemez", path: ["notifyFather"] });
  }
  if (data.notifyGuardian && !hasGuardian) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Telefonu olmayan bir kişi için bildirim seçilemez", path: ["notifyGuardian"] });
  }

  const notifyAny = (data.notifyMother && hasMother) || (data.notifyFather && hasFather) || (data.notifyGuardian && hasGuardian);
  if (!notifyAny) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Lütfen bildirim gönderilecek en az bir veli/yakın seçiniz",
      path: ["notifyMother"],
    });
  }
}

export const studentInputSchema = z
  .object({
    branchId: z.string().uuid("Şube seçimi zorunludur"),
    fullName: z.string().min(2),
    tcNo: tcNoSchema,
    dob: z.coerce
      .date()
      .refine((d) => new Date().getFullYear() - d.getFullYear() >= 5, "Sporcu yaşı en az 5 olmalıdır."),
    gender: z.enum(["erkek", "kiz"]).optional(),
    bloodType: z.string().optional(),
    heightCm: z.coerce.number().int().positive().optional(),
    weightKg: z.coerce.number().int().positive().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    photoUrl: z.string().optional(),
    motherName: z.string().optional(),
    motherPhone: z.string().optional(),
    motherJob: z.string().optional(),
    fatherName: z.string().optional(),
    fatherPhone: z.string().optional(),
    fatherJob: z.string().optional(),
    emergencyName: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notifyMother: z.boolean().optional().default(false),
    notifyFather: z.boolean().optional().default(false),
    notifyGuardian: z.boolean().optional().default(false),
    groupId: z.string().uuid().optional(),
    paymentDueDay: z.union([z.literal(15), z.literal(30)]),
    preRegistrationId: z.string().uuid().optional(),
  })
  .superRefine(validateContacts);

export type StudentInput = z.infer<typeof studentInputSchema>;

export const studentUpdateSchema = z
  .object({
    branchId: z.string().uuid("Şube seçimi zorunludur").optional(),
    fullName: z.string().min(2).optional(),
    tcNo: tcNoSchema.optional(),
    dob: z.coerce
      .date()
      .refine((d) => new Date().getFullYear() - d.getFullYear() >= 5, "Sporcu yaşı en az 5 olmalıdır.")
      .optional(),
    gender: z.enum(["erkek", "kiz"]).optional(),
    bloodType: z.string().optional(),
    heightCm: z.coerce.number().int().positive().optional(),
    weightKg: z.coerce.number().int().positive().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    photoUrl: z.string().optional(),
    motherName: z.string().optional(),
    motherPhone: z.string().optional(),
    motherJob: z.string().optional(),
    fatherName: z.string().optional(),
    fatherPhone: z.string().optional(),
    fatherJob: z.string().optional(),
    emergencyName: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notifyMother: z.boolean().optional(),
    notifyFather: z.boolean().optional(),
    notifyGuardian: z.boolean().optional(),
    groupId: z.string().uuid().optional(),
    paymentDueDay: z.union([z.literal(15), z.literal(30)]).optional(),
    preRegistrationId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    // İletişim/bildirim alanlarından hiçbiri bu istekte gönderilmemişse (örn. sadece boy/kilo
    // güncelleniyor) kontrolü atla — kısmi (PATCH benzeri) güncellemelerde diğer alanlara dokunmuyoruz.
    const CONTACT_KEYS = ["motherPhone", "fatherPhone", "emergencyPhone", "notifyMother", "notifyFather", "notifyGuardian"] as const;
    const touchesContacts = CONTACT_KEYS.some((k) => k in data);
    if (!touchesContacts) return;
    validateContacts(data, ctx);
  });

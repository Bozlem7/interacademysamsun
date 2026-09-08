import { z } from "zod";
import { tcNoSchema } from "../../common/security/tc";

export const studentInputSchema = z.object({
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
  groupId: z.string().uuid().optional(),
  paymentDueDay: z.union([z.literal(15), z.literal(30)]),
  preRegistrationId: z.string().uuid().optional(),
});

export type StudentInput = z.infer<typeof studentInputSchema>;

export const studentUpdateSchema = studentInputSchema.partial();

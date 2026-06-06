import { z } from "zod";

export const visitSchema = z
  .object({
    visit_date: z
      .string()
      .min(1, "Visit date is required")
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    visit_type_code: z.string().min(1, "Visit type is required"),
    consultation_category: z.string().optional(),
    doctor_id: z.string().optional(),
    is_scheduled: z.boolean().default(false),
    reason: z.string().max(500, "Too long").optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.is_scheduled && data.visit_date) {
      const visitDate = new Date(data.visit_date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (visitDate > today) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Non-scheduled visits cannot be future-dated",
          path: ["visit_date"],
        });
      }
    }
  });

export type VisitFormValues = z.infer<typeof visitSchema>;

export const caseSheetSchema = z.object({
  appetite: z.string().max(500, "Too long").optional(),
  sleep: z.string().max(500, "Too long").optional(),
  motion: z.string().max(500, "Too long").optional(),
  energy_level: z.string().max(500, "Too long").optional(),
  hereditary_diseases: z.string().max(2000, "Too long").optional(),
  past_ailments: z.string().max(2000, "Too long").optional(),
  surgeries: z.string().max(2000, "Too long").optional(),
  exercise_routine: z.string().max(1000, "Too long").optional(),
  deliveries: z.string().max(1000, "Too long").optional(),
  present_complaints: z.string().max(2000, "Too long").optional(),
  other_observations: z.string().max(2000, "Too long").optional(),
  remarks: z.string().max(2000, "Too long").optional(),
});

export type CaseSheetFormValues = z.infer<typeof caseSheetSchema>;

export const consultationNoteSchema = z
  .object({
    presenting_complaints: z.string().max(2000, "Too long").optional(),
    diagnosis: z.string().max(2000, "Too long").optional(),
    observations: z.string().max(2000, "Too long").optional(),
    treatment_advice: z.string().max(2000, "Too long").optional(),
    diet_advice: z.string().max(2000, "Too long").optional(),
    yoga_advice: z.string().max(2000, "Too long").optional(),
    review_date: z.string().optional(),
    doctor_id: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.review_date?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(data.review_date.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date must be YYYY-MM-DD",
        path: ["review_date"],
      });
    }
  });

export type ConsultationNoteFormValues = z.infer<typeof consultationNoteSchema>;

export const patientEditSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(150, "Too long"),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),
  age_years: z.string().optional(),
  mobile: z
    .string()
    .optional()
    .refine(
      (val) => !val?.trim() || /^\d{10,15}$/.test(val.trim()),
      { message: "Mobile must be 10–15 digits" }
    ),
  email: z
    .string()
    .optional()
    .refine(
      (val) => !val?.trim() || z.string().email().safeParse(val.trim()).success,
      { message: "Invalid email address" }
    ),
  address_line: z.string().max(255, "Too long").optional(),
  city: z.string().max(100, "Too long").optional(),
  state: z.string().max(100, "Too long").optional(),
  pincode: z.string().max(12, "Too long").optional(),
  blood_group: z.string().optional(),
  marital_status: z.string().optional(),
  dietary_preference: z.string().optional(),
  profession: z.string().max(120, "Too long").optional(),
  height_cm: z.string().optional(),
  weight_kg: z.string().optional(),
  remarks: z.string().max(2000, "Too long").optional(),
});

export type PatientEditFormValues = z.infer<typeof patientEditSchema>;

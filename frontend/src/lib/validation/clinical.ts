import { z } from "zod";

export const prescriptionItemSchema = z.object({
  medicine_name: z.string().max(120, "Too long").optional(),
  dosage: z.string().max(100, "Too long").optional(),
  dosage_unit: z.string().max(20).optional(),
  timing: z.string().max(100, "Too long").optional(),
  duration: z.string().max(100, "Too long").optional(),
  duration_unit: z.string().max(20).optional(),
  usage_instruction: z.string().max(500, "Too long").optional(),
  application_route: z.string().max(20).optional(),
});

export const prescriptionSchema = z
  .object({
    doctor_id: z.string().optional(),
    prescription_date: z.string().optional(),
    instructions: z.string().max(2000, "Too long").optional(),
    review_advice: z.string().max(1000, "Too long").optional(),
    medicine_details: z.string().max(4000, "Too long").optional(),
    items: z.array(prescriptionItemSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const hasItem = data.items.some((item) => item.medicine_name?.trim());
    const hasFreeText = Boolean(data.medicine_details?.trim());
    if (!hasItem && !hasFreeText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one medicine item or free-text medicine details",
        path: ["items"],
      });
    }
    if (data.prescription_date?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(data.prescription_date.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date must be YYYY-MM-DD",
        path: ["prescription_date"],
      });
    }
  });

export type PrescriptionFormValues = z.infer<typeof prescriptionSchema>;

export const dischargeSummarySchema = z
  .object({
    doctor_id: z.string().optional(),
    admission_date: z.string().optional(),
    discharge_date: z.string().optional(),
    diagnosis: z.string().max(2000, "Too long").optional(),
    presenting_complaints: z.string().max(2000, "Too long").optional(),
    investigations_admission: z.string().max(4000, "Too long").optional(),
    treatments: z.string().max(4000, "Too long").optional(),
    condition_at_discharge: z.string().max(120, "Too long").optional(),
    condition_notes: z.string().max(2000, "Too long").optional(),
    follow_up_period: z.string().max(2000, "Too long").optional(),
    discharge_advice: z.string().max(2000, "Too long").optional(),
    medications: z.string().max(2000, "Too long").optional(),
    yoga_guidance: z.string().max(2000, "Too long").optional(),
  })
  .superRefine((data, ctx) => {
    for (const field of ["admission_date", "discharge_date"] as const) {
      const value = data[field]?.trim();
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Date must be YYYY-MM-DD",
          path: [field],
        });
      }
    }
    if (
      data.admission_date?.trim() &&
      data.discharge_date?.trim() &&
      data.discharge_date.trim() < data.admission_date.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discharge date must be on or after admission date",
        path: ["discharge_date"],
      });
    }
  });

export type DischargeSummaryFormValues = z.infer<typeof dischargeSummarySchema>;

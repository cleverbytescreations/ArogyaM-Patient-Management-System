import { z } from "zod";

export const registerPatientSchema = z
  .object({
    full_name: z.string().min(1, "Full name is required").max(200, "Name too long"),
    op_category_code: z.string().min(1, "OP category is required"),
    gender: z.string().optional(),
    date_of_birth: z.string().optional(),
    age_years: z.string().optional(),
    mobile: z.string().optional(),
    email: z.string().optional(),
    address: z.string().max(500, "Address too long").optional(),
    blood_group: z.string().optional(),
    marital_status: z.string().optional(),
    dietary_preference: z.string().optional(),
    occupation: z.string().max(100, "Occupation too long").optional(),
    height_cm: z.string().optional(),
    weight_kg: z.string().optional(),
    hereditary_diseases: z.string().max(1000, "Too long").optional(),
    allergies: z.string().max(1000, "Too long").optional(),
    remarks: z.string().max(2000, "Too long").optional(),
  })
  .superRefine((data, ctx) => {
    const hasMobile = Boolean(data.mobile?.trim());
    const hasEmail = Boolean(data.email?.trim());
    const hasDOB = Boolean(data.date_of_birth?.trim());
    const hasAge = Boolean(data.age_years?.trim());

    if (!hasMobile && !hasEmail && !hasDOB && !hasAge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one of mobile, email, date of birth, or age is required.",
        path: ["mobile"],
      });
    }

    if (data.mobile?.trim() && !/^\d{10,15}$/.test(data.mobile.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mobile must be 10–15 digits",
        path: ["mobile"],
      });
    }

    if (data.email?.trim()) {
      const emailResult = z.string().email().safeParse(data.email.trim());
      if (!emailResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid email address",
          path: ["email"],
        });
      }
    }

    if (
      data.date_of_birth?.trim() &&
      !/^\d{4}-\d{2}-\d{2}$/.test(data.date_of_birth.trim())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date must be in YYYY-MM-DD format",
        path: ["date_of_birth"],
      });
    }

    if (data.age_years?.trim()) {
      const age = Number(data.age_years);
      if (isNaN(age) || !Number.isInteger(age) || age < 0 || age > 150) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Age must be a whole number between 0 and 150",
          path: ["age_years"],
        });
      }
    }

    if (data.height_cm?.trim()) {
      const h = Number(data.height_cm);
      if (isNaN(h) || h <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Height must be a positive number",
          path: ["height_cm"],
        });
      }
    }

    if (data.weight_kg?.trim()) {
      const w = Number(data.weight_kg);
      if (isNaN(w) || w <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Weight must be a positive number",
          path: ["weight_kg"],
        });
      }
    }
  });

export type RegisterPatientFormValues = z.infer<typeof registerPatientSchema>;

export const patientSearchSchema = z.object({
  q: z.string().optional(),
});

export type PatientSearchFormValues = z.infer<typeof patientSearchSchema>;

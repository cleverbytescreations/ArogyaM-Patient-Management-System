import { z } from "zod";

const roleCodeEnum = z.enum(["ADMIN", "DOCTOR", "RECEPTION", "DATA_ENTRY"]);

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be at most 50 characters")
    .regex(/^[a-z0-9_.-]+$/, "Only lowercase letters, digits, dots, hyphens and underscores"),
  full_name: z.string().min(1, "Full name is required").max(200),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  mobile: z
    .string()
    .regex(/^\d{10,15}$/, "Mobile must be 10–15 digits")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
  is_doctor: z.boolean(),
  role_codes: z
    .array(roleCodeEnum)
    .min(1, "At least one role is required"),
});

export const editUserSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(200),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  mobile: z
    .string()
    .regex(/^\d{10,15}$/, "Mobile must be 10–15 digits")
    .optional()
    .or(z.literal("")),
  is_doctor: z.boolean(),
  role_codes: z
    .array(roleCodeEnum)
    .min(1, "At least one role is required"),
});

export const resetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password too long"),
    confirm_password: z.string().min(1, "Please confirm the password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
export type EditUserFormValues = z.infer<typeof editUserSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

import { z } from "zod";

export const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const documentUploadSchema = z.object({
  document_type_code: z.string().min(1, "Document type is required"),
  visit_id: z.string().optional(),
  title: z.string().max(160, "Too long").optional(),
  document_date: z.string().optional(),
  is_historical: z.boolean().default(false),
  remarks: z.string().max(1000, "Too long").optional(),
  file: z
    .custom<File>((value) => value instanceof File, "File is required")
    .refine((file) => ALLOWED_DOCUMENT_TYPES.includes(file.type), "Only PDF, JPEG, or PNG files are allowed")
    .refine((file) => file.size <= MAX_DOCUMENT_SIZE_BYTES, "File must be 10 MB or smaller"),
});

export type DocumentUploadFormValues = z.infer<typeof documentUploadSchema>;

export const documentUpdateSchema = z.object({
  title: z.string().max(160, "Too long").optional(),
  document_type_code: z.string().min(1, "Document type is required"),
  status: z.enum(["ACTIVE", "ARCHIVED", "DELETED"]),
  remarks: z.string().max(1000, "Too long").optional(),
});

export type DocumentUpdateFormValues = z.infer<typeof documentUpdateSchema>;

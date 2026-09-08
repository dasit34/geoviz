import { z } from "zod";

export const orderInputSchema = z.object({
  websiteUrl: z
    .string()
    .trim()
    .min(3, "Website URL is required")
    .max(500)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url("Please enter a valid website URL")),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address")
    .max(254),
  businessName: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  competitorUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine(
      (v) =>
        !v ||
        z
          .string()
          .url()
          .safeParse(/^https?:\/\//i.test(v) ? v : `https://${v}`).success,
      { message: "Please enter a valid competitor URL" },
    ),
});

export type OrderInput = z.infer<typeof orderInputSchema>;

export const foundationFixInputSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required").max(200),
  websiteUrl: z
    .string()
    .trim()
    .min(3, "Website URL is required")
    .max(500)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url("Please enter a valid website URL")),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address")
    .max(254),
  auditOrderId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type FoundationFixInput = z.infer<typeof foundationFixInputSchema>;

export const freeCheckInputSchema = z.object({
  websiteUrl: z
    .string()
    .trim()
    .min(3, "Website URL is required")
    .max(500)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url("Please enter a valid website URL")),
  businessName: z
    .string()
    .trim()
    .min(2, "Business name is required")
    .max(200),
  // city / state / category are optional — they only sharpen three
  // substring sub-checks in deriveChecks() (which is fully null-safe),
  // and the paid audit infers category + location from the site
  // itself. `.default("")` keeps the non-null FreeCheckSubmission
  // columns satisfied without a migration.
  city: z.string().trim().max(100).optional().default(""),
  state: z.string().trim().max(100).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address")
    .max(254),
  // Honeypot — real visitors never see or fill this field (hidden +
  // off-form-flow via CSS). A non-empty value marks the submission as
  // bot traffic; the API route accepts it silently without doing any
  // real work. See src/components/FreeCheckForm.tsx.
  website2: z.string().trim().max(200).optional(),
});

export type FreeCheckFormInput = z.infer<typeof freeCheckInputSchema>;

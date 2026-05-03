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

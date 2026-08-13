import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: 'Not an email address',
  });

const passwordSchema = z.string().min(1).max(256);

const confirmationCodeSchema = z.string().trim().min(1).max(16);

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const confirmationSchema = z.object({
  email: emailSchema,
  code: confirmationCodeSchema,
});

export const resendSchema = z.object({
  email: emailSchema,
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type Confirmation = z.infer<typeof confirmationSchema>;
export type ResendRequest = z.infer<typeof resendSchema>;

export function parseRequest<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);

  return result.success ? result.data : null;
}

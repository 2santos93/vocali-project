import { z } from 'zod';

/**
 * Validated rather than cast: `body as Credentials` compiles, and then
 * `credentials.email.trim()` throws on `undefined` inside a Cognito call whose
 * failure reaches the user as "no hemos podido completar la operación".
 */

/**
 * Deliberately loose. Cognito is the authority on what it will accept, and a
 * stricter pattern here would reject a valid address with a message the user
 * cannot act on.
 */
const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: 'Not an email address',
  });

/**
 * No maximum below Cognito's, and no pattern: the password policy lives in the
 * user pool, where it is enforced. A client-side rule stricter than the
 * server's silently forbids passwords the account could have had.
 */
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

/**
 * `safeParse` rather than `parse`, so a malformed body becomes the route's own
 * 400 with a Spanish message instead of a Zod stack trace rendered as a 500.
 */
export function parseRequest<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);

  return result.success ? result.data : null;
}

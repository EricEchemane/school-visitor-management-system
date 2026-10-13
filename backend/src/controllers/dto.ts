import { z } from 'zod';
import { badRequest } from '../common/errors';

export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(`${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return result.data;
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');
const name = z.string().trim().min(1, 'is required').max(120);
const contact = z.string().trim().max(30).nullish();

export const preRegisterSchema = z.object({
  visitorName: name,
  visitorContact: contact,
  purpose: z.string().trim().min(1, 'is required').max(200),
  date: z.string(),
  windowStart: time.nullish(),
  windowEnd: time.nullish(),
  durationMinutes: z.number().int().min(5).max(720).optional(),
  hostId: z.string().uuid().optional(),
});
export const updatePreSchema = preRegisterSchema.partial();

export const walkInSchema = z.object({
  visitorName: name,
  visitorContact: contact,
  purpose: z.string().trim().min(1, 'is required').max(200),
  hostId: z.string().uuid(),
  confirmDuplicate: z.boolean().optional(),
});

export const respondSchema = z.object({
  decision: z.enum(['confirm', 'decline']),
  reason: z.string().trim().max(200).optional(),
});

export const checkOutSchema = z.object({ code: z.string().trim().min(1, 'is required').max(100) });
export const correctSchema = z.object({ departedAt: z.string().datetime() });
export const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

const password = z.string().min(8, 'must be at least 8 characters').max(100);
export const createUserSchema = z.object({
  email: z.string().email(),
  name,
  password,
  roleId: z.number().int(),
  mobile: contact,
});
export const updateUserSchema = z.object({
  name: name.optional(),
  roleId: z.number().int().optional(),
  active: z.boolean().optional(),
  mobile: contact,
  password: password.optional(),
});
export const roleSchema = z.object({ name: z.string().trim().min(1).max(60), permissions: z.array(z.string()) });
export const rolePermsSchema = z.object({ permissions: z.array(z.string()) });

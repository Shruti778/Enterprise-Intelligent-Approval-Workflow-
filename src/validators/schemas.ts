import { z } from 'zod';
import { REQUEST_TYPES, REQUEST_STATUSES } from '../types/domain';

export const loginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const metadataSchema = z.record(z.any()).default({});

export const createRequestSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().max(5000).optional().nullable(),
  amount: z.coerce.number().min(0, 'Amount cannot be negative').default(0),
  metadata: metadataSchema,
});

export const updateRequestSchema = createRequestSchema.partial();

export const listRequestsSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  type: z.enum(REQUEST_TYPES).optional(),
  search: z.string().optional(),
  mine: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('A numeric id is required'),
});

export const stepIdParamSchema = z.object({
  stepId: z.coerce.number().int().positive('A numeric step id is required'),
});

export const approveSchema = z.object({
  comment: z.string().max(2000).optional().nullable(),
});

export const rejectSchema = z.object({
  comment: z.string().trim().min(3, 'A rejection comment of at least 3 characters is required').max(2000),
});

export const simulateSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  amount: z.coerce.number().min(0).default(0),
  metadata: metadataSchema,
});

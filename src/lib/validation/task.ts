import { z } from "zod";

export const taskStatusEnum = z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]);
export const taskPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional().nullable(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assigneeId: z.string().min(1).optional().nullable(),
  siteId: z.string().min(1).optional().nullable(),
  findingCode: z.string().trim().optional().nullable(),
  pageUrl: z.string().trim().optional().nullable(),
  dueAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assigneeId: z.string().min(1).optional().nullable(),
  siteId: z.string().min(1).optional().nullable(),
  findingCode: z.string().trim().optional().nullable(),
  pageUrl: z.string().trim().optional().nullable(),
  dueAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

import { z } from "zod";

export const teamRoleEnum = z.enum(["Admin", "Member", "Viewer"]);

export const teamMemberCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Must be a valid email"),
  role: teamRoleEnum,
});

export const teamMemberUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  role: teamRoleEnum.optional(),
});

import { z } from "zod";

export const alertUpdateSchema = z.object({
  read: z.boolean(),
});

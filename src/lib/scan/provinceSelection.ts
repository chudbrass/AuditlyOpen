import { z } from "zod";
import { CANADIAN_PROVINCES } from "@/lib/crawler/provinces";

export const provinceSelection = z.array(z.enum(CANADIAN_PROVINCES))
  .min(1, "Select at least one province")
  .max(CANADIAN_PROVINCES.length)
  .transform((selected) => CANADIAN_PROVINCES.filter((province) => selected.includes(province)))
  .optional();

import { createHash } from "node:crypto";

/** Bounded database identity for an already-normalized URL. */
export function urlIdentity(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

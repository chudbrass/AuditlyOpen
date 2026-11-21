import { readFileSync } from "node:fs";

function readDotenvValue(name) {
  try {
    const line = readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    return line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

function isStrong(value) {
  const weak = new Set(["change-me", "changeme", "password", "password123", "auditly", "admin", "letmein", "qwerty"]);
  if (!value || value.length < 16 || weak.has(value.trim().toLowerCase())) return false;
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length >= 3;
}

const password = process.env.AUDITLY_PASSWORD ?? readDotenvValue("AUDITLY_PASSWORD");
if (!isStrong(password)) {
  console.error("Auditly refused to start: set AUDITLY_PASSWORD to at least 16 characters using at least three character classes; placeholders and common passwords are rejected.");
  process.exit(1);
}

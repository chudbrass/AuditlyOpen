const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const COMMON_WEAK_PASSWORDS = new Set([
  "change-me",
  "changeme",
  "password",
  "password123",
  "auditly",
  "admin",
  "letmein",
  "qwerty",
]);

export function isStrongAuditlyPassword(value: string | undefined): value is string {
  if (!value || value.length < 16 || COMMON_WEAK_PASSWORDS.has(value.trim().toLowerCase())) {
    return false;
  }

  const characterClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  return characterClasses >= 3;
}

export function isMutationMethod(method: string) {
  return MUTATION_METHODS.has(method.toUpperCase());
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function hasSameOrigin(request: Pick<Request, "headers" | "url">): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;

  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
    const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
    const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const protocol = forwardedProto ? `${forwardedProto}:` : requestUrl.protocol;
    return new URL(origin).origin === new URL(`${protocol}//${host}`).origin;
  } catch {
    return false;
  }
}

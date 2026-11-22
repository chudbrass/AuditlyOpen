import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasSameOrigin, isMutationMethod, isStrongAuditlyPassword } from "@/lib/security";

const REALM = "Auditly";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

function getBasicPassword(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    return separator === -1 ? null : decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const expectedPassword = process.env.AUDITLY_PASSWORD;

  if (!isStrongAuditlyPassword(expectedPassword)) {
    return new NextResponse("Server authentication is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (getBasicPassword(request) !== expectedPassword) return unauthorized();

  if (isMutationMethod(request.method) && !hasSameOrigin(request)) {
    return NextResponse.json(
      { error: "Mutation rejected: request origin does not match this Auditly instance" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico).*)"],
};

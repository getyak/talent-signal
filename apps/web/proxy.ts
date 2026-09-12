import { NextResponse, type NextRequest } from "next/server";

// Browser workspace mutations must declare the account rendered by their tab.
// The route's backend authentication still verifies that account and authority.
// Login, the public demo, development fixtures and the separately authenticated
// extension protocol own their existing admission boundaries.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, "");
  const separateBoundary = path === "/api/analyze"
    || ["/api/auth", "/api/browser-extension", "/api/dev"].some(
      prefix => path === prefix || path.startsWith(`${prefix}/`),
    );
  // Installed extensions use this exact task-create transport. Its route
  // requires a matching session fingerprint before reading any request body.
  const sessionBoundHandoff = request.method === "POST" && path === "/api/contact-agent/tasks"
    && Boolean(request.headers.get("x-contact-handoff-session")?.trim());
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (!readOnly && !separateBoundary && !sessionBoundHandoff && !request.headers.get("x-talent-signal-workspace")?.trim()) {
    return NextResponse.json({ code: "backend_session_expired" }, {
      status: 401,
      headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };

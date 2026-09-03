import { NextResponse, type NextRequest } from "next/server";

/**
 * Protección opcional con usuario/contraseña (HTTP Basic Auth).
 * Se activa solo si existe DASHBOARD_PASSWORD. /api/health queda libre para
 * el healthcheck de Railway.
 */
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  const expectedUser = process.env.DASHBOARD_USER || "admin";
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      decoded = "";
    }
    const separator = decoded.indexOf(":");
    const user = separator >= 0 ? decoded.slice(0, separator) : decoded;
    const pass = separator >= 0 ? decoded.slice(separator + 1) : "";
    if (user === expectedUser && pass === password) return NextResponse.next();
  }

  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dashboard Ventas", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

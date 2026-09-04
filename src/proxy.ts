import { NextResponse, type NextRequest } from "next/server";

/**
 * Protección con usuario/contraseña (HTTP Basic Auth), mismas variables que
 * mkt-dashboard: DASH_USER / DASH_PASS (se aceptan DASHBOARD_USER /
 * DASHBOARD_PASSWORD). Se activa solo si hay contraseña.
 *
 * Quedan libres: el healthcheck (/api/health, /salud) y el webhook de Kommo
 * (/api/webhooks/*, que se protege con KOMMO_WEBHOOK_SECRET).
 */
export function proxy(request: NextRequest) {
  const password = (process.env.DASH_PASS || process.env.DASHBOARD_PASSWORD || "").trim();
  if (!password) return NextResponse.next();

  const expectedUser = (process.env.DASH_USER || process.env.DASHBOARD_USER || "admin").trim();
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/health|salud|api/webhooks/).*)"],
};

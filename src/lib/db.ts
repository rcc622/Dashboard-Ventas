import { Pool } from "pg";

/**
 * Pool de Postgres a partir de una cadena de conexión (Railway Postgres,
 * Supabase directo o pooler). SSL se decide aquí, no con `sslmode` en la URL:
 * los certificados de Supabase/Railway no siempre pasan verificación estricta
 * desde Node, así que se usa TLS sin verificar CA salvo en localhost.
 */
export function createPool(url: string, max = 3): Pool {
  let connectionString = url;
  let ssl: { rejectUnauthorized: boolean } | undefined = { rejectUnauthorized: false };
  try {
    const u = new URL(url);
    const mode = u.searchParams.get("sslmode");
    u.searchParams.delete("sslmode");
    connectionString = u.toString();
    if (mode === "disable" || /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(u.hostname)) ssl = undefined;
  } catch {
    // URL no parseable: pg la intenta tal cual
  }
  return new Pool({
    connectionString,
    max,
    ssl,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 120_000,
  });
}

/** Descripción corta y sin credenciales para logs y estado. */
export function describeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "postgres";
  }
}

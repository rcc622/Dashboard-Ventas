import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway inyecta PORT; `next start` lo respeta automáticamente.
  poweredByHeader: false,
  // Mismas rutas que mkt-dashboard (Railway ya las conoce).
  async rewrites() {
    return [
      { source: "/salud", destination: "/api/health" },
      { source: "/estado", destination: "/api/sync/status" },
      { source: "/refrescar", destination: "/api/sync/run" },
    ];
  },
};

export default nextConfig;

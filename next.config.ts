import type { NextConfig } from "next";

import { browserSecurityHeaders, sensitiveNoStoreHeaders } from "./src/server/security/response-policy";

const sensitiveRoutes = [
  "/booking/:path*",
  "/admin/:path*",
  "/tracking/:path*",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: browserSecurityHeaders(process.env.NODE_ENV) },
      ...sensitiveRoutes.map((source) => ({ source, headers: sensitiveNoStoreHeaders })),
    ];
  },
};

export default nextConfig;

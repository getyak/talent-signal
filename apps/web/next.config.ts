import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  distDir: process.env.TALENT_SIGNAL_NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/dist/ssr"],
    // Next.js needs the TypeScript 6 API while the workspace CLI uses native TypeScript 7.
    useTypeScriptCli: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["mammoth", "pdf-parse"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

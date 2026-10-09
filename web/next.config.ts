import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "**" }], formats: ["image/avif", "image/webp"] },
  experimental: { optimizePackageImports: ["lucide-react", "recharts"] },
  // Always emit metadata in <head> (no streamed/hoisted <title>/<meta>): our metadata is static per route, so blocking costs nothing,
  // and crawlers / Lighthouse read <meta name="description"> without running JS.
  htmlLimitedBots: /./,
  // Root → /overview as a real HTTP redirect (no client-side redirect() hop, which raised React #310 during the double navigation).
  async redirects() { return [{ source: "/", destination: "/overview", permanent: false }]; },
  async headers() {
    // No X-Frame-Options: the platform shows the preview inside an iframe on another origin; SAMEORIGIN made that iframe render blank
    // even though every route answered HTTP 200. Click-jacking exposure is acceptable for a read-only dashboard whose only secret
    // lives in the user's own localStorage. The CSP below is frame-ancestors ONLY (explicitly allow any embedding origin) — no other
    // directives, so Next's inline bootstrap scripts are unaffected.
    return [{ source: "/(.*)", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors *;" },
      { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};
export default nextConfig;

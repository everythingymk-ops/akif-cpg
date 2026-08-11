import type { NextConfig } from "next";

/**
 * The app is fully client-side (localStorage behind the repository interface,
 * no server actions or API routes), so it can also ship as a static bundle
 * that opens straight from the filesystem. `npm run export:static` sets
 * STATIC_EXPORT=1; the normal dev/build path is untouched.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export",
        // Emit portfolio/index.html rather than portfolio.html so plain static
        // servers resolve deep links and reloads. Asset paths stay absolute:
        // a relative prefix would resolve to /portfolio/_next/… on subroutes.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;

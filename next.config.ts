import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Payload's local D1 adapter shares one SQLite database. Serial page-data
    // collection avoids Miniflare SQLITE_BUSY failures during `next build`.
    cpus: 1,
  },
  images: {
    localPatterns: [{ pathname: "/api/media/file/**" }],
  },
  // These packages use Cloudflare's Workers-compatible runtime APIs.
  serverExternalPackages: ["jose", "pg-cloudflare"],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    return webpackConfig;
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });

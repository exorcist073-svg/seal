import type { NextConfig } from "next";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** Full Node-compatible Buffer (incl. writeBigUInt64BE) for @lit-protocol/crypto in the browser. */
const bufferEntry = require.resolve("buffer");

const sealBackend =
  process.env.SEAL_API_PROXY_TARGET?.replace(/\/$/, "") ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      buffer: bufferEntry,
    },
  },
  webpack: (config, { webpack: webpackInstance, isServer }) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      buffer: bufferEntry,
    };
    if (!isServer) {
      config.plugins.push(
        new webpackInstance.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
      );
    }
    return config;
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${sealBackend}/api/:path*` },
      { source: "/health", destination: `${sealBackend}/health` },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

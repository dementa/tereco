import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The Library's service worker (public/sw.js). Never HTTP-cached, so a
        // fix reaches installed copies on their next visit. connect-src must
        // name Cloudinary: the worker itself fetches library files from there.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'; connect-src 'self' https://res.cloudinary.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    // Disable API caching during development
    // {
    //   urlPattern: /^https:\/\/localhost:8000\/api\/.*$/,
    //   handler: "NetworkFirst",
    //   options: {
    //     cacheName: "api-cache",
    //     expiration: {
    //       maxEntries: 32,
    //       maxAgeSeconds: 24 * 60 * 60, // 1 day
    //     },
    //   },
    // },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: "/api/walls/:path*",
        destination: "http://backend:8000/api/walls/:path*",
      },
      {
        source: "/api/oembed/:path*",
        destination: "http://backend:8000/api/oembed/:path*",
      },
      {
        source: "/api/share/:path*", 
        destination: "http://backend:8000/api/share/:path*",
      },
      {
        source: "/api/health",
        destination: "http://backend:8000/api/health",
      },
    ];
  },
};

module.exports = withPWA(nextConfig);

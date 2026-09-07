/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  swcMinify: true,
  poweredByHeader: false,

  // Multi-stage production Dockerfile: enabled when STANDALONE=true / OUTPUT_STANDALONE=1.
  // When building for Vercel or local dev/test, Next.js native build is used.
  ...(process.env.STANDALONE === "true" || process.env.OUTPUT_STANDALONE === "1" ? { output: "standalone" } : {}),

  experimental: {
    // Tree-shake and optimize heavy component and icon libraries for ultra-fast bundle parsing
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-progress",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "recharts",
      "framer-motion",
    ],
  },

  async redirects() {
    return [
      // Legacy routes → new enterprise URL scheme (301 permanent)
      { source: "/topology", destination: "/command-center/topology", permanent: true },
      { source: "/wargame", destination: "/campaigns", permanent: true },
      { source: "/playground", destination: "/sandbox", permanent: true },
      { source: "/attack-library", destination: "/library", permanent: true },
      { source: "/policies", destination: "/admin/policies", permanent: true },
      { source: "/providers", destination: "/admin/providers", permanent: true },

      // Deep legacy paths
      { source: "/wargame/:path*", destination: "/campaigns/:path*", permanent: true },
      { source: "/playground/:path*", destination: "/sandbox/:path*", permanent: true },
      { source: "/attack-library/:path*", destination: "/library/:path*", permanent: true },
      { source: "/policies/:path*", destination: "/admin/policies/:path*", permanent: true },
      { source: "/providers/:path*", destination: "/admin/providers/:path*", permanent: true },
      { source: "/topology/:path*", destination: "/command-center/topology/:path*", permanent: true },
      { source: "/register", destination: "/login?mode=register", permanent: false },
      { source: "/signup", destination: "/login?mode=register", permanent: false },
      // Command Center moved from /dashboard → /command-center
      { source: "/dashboard", destination: "/command-center", permanent: false },
      { source: "/dashboard/:path*", destination: "/command-center/:path*", permanent: false },
    ];
  },

  async rewrites() {
    const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
    if (backendUrl && !backendUrl.includes("127.0.0.1") && !backendUrl.includes("localhost")) {
      return [
        {
          source: "/api/backend/:path*",
          destination: `${backendUrl}/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;

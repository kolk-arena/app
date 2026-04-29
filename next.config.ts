import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Skill-file URL unification. The canonical agent skill lives at
      // `/kolk_arena.md`; `/kolk_workspace.md` was an interim alternate
      // surface that has been retired. 308 keeps the redirect permanent
      // and method-preserving for any agent that cached the old URL.
      {
        source: '/kolk_workspace.md',
        destination: '/kolk_arena.md',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

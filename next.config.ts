import type { NextConfig } from "next";

// Security headers. Phase 0 shipped these as containment; Phase 4 promotes the CSP from
// Report-Only to ENFORCED now that the app's real needs are settled.
//
// The app is same-origin by construction: the browser only ever talks to our own /api/* routes,
// which fetch the biomedical upstreams server-side behind an allowlist (src/lib/http.ts). So
// `connect-src 'self'` is exact — including the Phase 5 3D viewer, which loads structures through a
// same-origin proxy (/api/structure) rather than hitting AlphaFold/RCSB from the browser. 3Dmol.js
// renders to a WebGL canvas (not restricted by CSP) and, for cartoon/stick rendering, needs no Web
// Worker, blob: URL or eval — so no extra directives are required. If a later viewer phase adds
// molecular SURFACES (3Dmol spins up a worker via a blob: URL for those), add `worker-src blob:`.
//
// `'unsafe-inline'` remains in script-src/style-src because Next's App Router injects inline
// hydration scripts and inlines critical CSS; a nonce-based policy is the stricter future upgrade,
// deliberately deferred to avoid breaking hydration for a marginal gain. object-src/base-uri/
// frame-ancestors are the high-value clickjacking/injection locks and are fully enforced.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // /api/v1/batch resolves an arbitrary id list at REQUEST time (it can't use generateStaticParams
  // like the single-record /api/v1/{gene,variant}/[id] routes, which are prerendered from a build-
  // time filesystem walk), so it reads `corpus/**` from disk on every call. Vercel's serverless
  // bundler only auto-traces files it sees referenced through static imports or generateStaticParams
  // — a dynamic `readFile(join(root, ...))` path is invisible to that trace, so without this the
  // batch route's function would ship without the corpus directory and every lookup would 404 in
  // production despite working locally. This pins corpus/** into that one route's bundle.
  outputFileTracingIncludes: {
    "/api/v1/batch": ["./corpus/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;

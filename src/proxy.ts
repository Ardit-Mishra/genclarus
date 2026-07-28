// Identifier-case canonicalization across ALL corpus surfaces (pages, /api/v1, /embed) so a
// lowercase or mixed-case deep link / API call resolves consistently with the homepage lookup and
// the /api/v1/batch endpoint — both of which already normalize case at request time. The single-
// record pages and API routes are `dynamicParams = false` + `force-static`, so a non-canonical param
// (e.g. `brca1`) is never in the prerendered set and Next returns a static 404 before the handler
// runs; that produced a real cross-surface inconsistency (batch found `brca1`, the page/API 404'd).
//
// Canonical forms: genes are UPPERCASE, rsIDs are lowercase `rs<digits>`. A mismatched request
// 308-redirects (permanent, method+body preserving) to the canonical URL — which keeps the SEO
// canonical intact and lets an invalid-but-canonical id (e.g. `/gene/NOTAGENE`) still fall through
// to the normal, safe 404. Middleware runs at the edge and reads no filesystem, so it only decides
// canonical *casing*; corpus membership is still validated by the static route as before.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const GENE = /^\/((?:api\/v1\/|embed\/)?gene)\/([^/]+)\/?$/;
const VARIANT = /^\/((?:api\/v1\/|embed\/)?variant)\/([^/]+)\/?$/;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const gene = pathname.match(GENE);
  if (gene) {
    const raw = safeDecode(gene[2]);
    const canon = raw.toUpperCase();
    if (canon !== raw) return redirect(req, `/${gene[1]}/${encodeURIComponent(canon)}`);
    return NextResponse.next();
  }

  const variant = pathname.match(VARIANT);
  if (variant) {
    const raw = safeDecode(variant[2]);
    // Only touch things already shaped like an rsID; leave anything else for the route's own 404.
    if (/^rs\d+$/i.test(raw)) {
      const canon = raw.toLowerCase();
      if (canon !== raw) return redirect(req, `/${variant[1]}/${canon}`);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function redirect(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: [
    "/gene/:sym",
    "/variant/:id",
    "/api/v1/gene/:sym",
    "/api/v1/variant/:id",
    "/embed/gene/:sym",
    "/embed/variant/:id",
  ],
};

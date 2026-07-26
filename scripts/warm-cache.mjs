// Post-deploy cache warmer — makes the demo bulletproof.
//
// The persistent Data Cache only helps AFTER a lookup has grounded once. The first visitor to a
// given gene/variant still rolls the flaky free-tier model, so a recruiter's very first click could
// land on the source-only fallback. This script pre-grounds the canonical demo set against a running
// deployment, retrying each until it grounds (a failure is never cached, so re-hitting simply tries
// again), so by the time anyone visits, every showcase query is already cached and instant.
//
// Usage:
//   node scripts/warm-cache.mjs [baseUrl]
//   BASE_URL=https://genclarus.com node scripts/warm-cache.mjs
// Defaults to the production site. Safe to run repeatedly and after every deploy — warming a query
// that is already cached is a no-op hit.

const BASE_URL = (process.argv[2] || process.env.BASE_URL || "https://genclarus.com").replace(/\/$/, "");
const MAX_ATTEMPTS = 6;
const DELAY_MS = 2_000;

// The queries a recruiter (or the README) is most likely to try. Genes with well-known summaries and
// variants that exercise the ClinVar/dbSNP/gnomAD path and the per-condition classification UI.
const DEMO = [
  { type: "gene", identifier: "BRCA1" },
  { type: "gene", identifier: "TP53" },
  { type: "gene", identifier: "CFTR" },
  { type: "variant", identifier: "rs6025" }, // Factor V Leiden
  { type: "variant", identifier: "rs334" }, // sickle-cell HBB
  { type: "variant", identifier: "rs1801133" }, // MTHFR
  { type: "variant", identifier: "rs121913529" }, // KRAS G12D
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function warmOne({ type, identifier }) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, identifier }),
      });
      if (!res.ok) {
        // 4xx is a real answer (bad input) — retrying won't help; anything else, back off and retry.
        if (res.status >= 400 && res.status < 500) return { ok: false, reason: `http_${res.status}` };
        await sleep(DELAY_MS);
        continue;
      }
      const body = await res.json();
      if (Array.isArray(body.claims) && body.claims.length > 0) {
        return { ok: true, cached: body.cached === true, claims: body.claims.length, attempts: attempt };
      }
      // Grounded nothing this time (flaky provider / failed grounding). A failure is never cached, so
      // wait and try again — the next attempt may ground and stick.
      if (attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
      else return { ok: false, reason: body.fallbackReason || "not_grounded", attempts: attempt };
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
      else return { ok: false, reason: err?.message || "network_error", attempts: attempt };
    }
  }
  return { ok: false, reason: "exhausted", attempts: MAX_ATTEMPTS };
}

async function main() {
  console.log(`Warming ${DEMO.length} demo queries against ${BASE_URL}\n`);
  let grounded = 0;
  for (const q of DEMO) {
    const label = `${q.type} ${q.identifier}`.padEnd(22);
    const r = await warmOne(q);
    if (r.ok) {
      grounded++;
      const tag = r.cached ? "cached" : "grounded";
      console.log(`  ✓ ${label} ${tag} (${r.claims} claims, attempt ${r.attempts})`);
    } else {
      console.log(`  ✗ ${label} not grounded — ${r.reason} (after ${r.attempts ?? MAX_ATTEMPTS} attempts)`);
    }
  }
  console.log(`\n${grounded}/${DEMO.length} demo queries grounded and cached.`);
  // Non-zero exit if any demo query never grounded, so a CI/post-deploy step can flag it — but note
  // free-tier flakiness means a rerun often clears a stray miss.
  process.exit(grounded === DEMO.length ? 0 : 1);
}

main();

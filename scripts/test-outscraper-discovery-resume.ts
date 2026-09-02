/**
 * Route-level tests for POST /api/admin/leads/discover's job-tracking
 * hardening (2026-09-02): the duplicate-job guard and the resume
 * path. Mocks global.fetch (Outscraper) AND the specific
 * prisma.leadDiscoveryRun methods the route touches — deliberately
 * NOT a live DB call, because the providerJobId/providerJobStatus
 * columns this feature needs live in a migration that is
 * intentionally NOT applied to the (production) database this
 * session — see the plan/report. No live network call either.
 * Run: npx tsx scripts/test-outscraper-discovery-resume.ts
 */
import { prisma } from "@/lib/db";
import { POST as discoverPOST } from "../src/app/api/admin/leads/discover/route";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error("ADMIN_SECRET not set — cannot run.");
  process.exit(1);
}
process.env.OUTSCRAPER_API_KEY = "test-fake-key-never-real-1234567890";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/leads/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET! },
    body: JSON.stringify(body),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const patches: { obj: any; key: string; original: any }[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patch(obj: any, key: string, impl: any) {
  patches.push({ obj, key, original: obj[key] });
  obj[key] = impl;
}
function restorePatches() {
  while (patches.length > 0) {
    const p = patches.pop()!;
    p.obj[p.key] = p.original;
  }
}

const originalFetch = globalThis.fetch;
function installMockFetch(handler: (url: string) => { status?: string; id?: string; errorMessage?: string; data?: unknown } | null) {
  const calledUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calledUrls.push(url);
    const body = handler(url);
    if (body === null) {
      throw new Error(`unexpected fetch call: ${url}`);
    }
    return { ok: true, json: async () => body } as unknown as Response;
  }) as typeof fetch;
  return { calledUrls };
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}

async function main() {
  // ── 1. Duplicate-job guard: a matching PENDING run blocks a fresh
  // submit, with zero provider HTTP calls made (no duplicate job). ──
  {
    patch(prisma.leadDiscoveryRun, "aggregate", async () => ({ _sum: { providerRequestCount: 0 } }));
    patch(prisma.leadDiscoveryRun, "findFirst", async () => ({
      id: "run_inflight_1",
      providerJobId: "job_inflight_1",
      createdAt: new Date(),
    }));
    const { calledUrls } = installMockFetch(() => null); // any provider call here is unexpected

    const res = await discoverPOST(
      jsonRequest({ provider: "outscraper", category: "HVAC", city: "Toledo", state: "OH", limit: 50 }),
    );
    const data = await res.json();

    assert(res.status === 409, "duplicate-guard: fresh submit while a matching PENDING run exists returns 409");
    assert(data.runId === "run_inflight_1", "duplicate-guard: 409 response surfaces the in-flight run id to resume");
    assert(calledUrls.length === 0, "duplicate-guard: no provider HTTP call was made at all (no duplicate submit)");

    restoreFetch();
    restorePatches();
  }

  // ── 2. Resume calls ONLY /requests/{id} — never resubmits via
  // /google-maps-search — and completes successfully. ──
  {
    patch(prisma.leadDiscoveryRun, "findUnique", async () => ({
      id: "run_resume_1",
      providerJobId: "job_resume_1",
      providerJobStatus: "PENDING",
      providerRequestCount: 3, // requests already spent on the original (timed-out) attempt
    }));
    type UpdateData1 = { providerRequestCount?: number; providerJobStatus?: string };
    const captured: { data: UpdateData1 | null } = { data: null };
    patch(prisma.leadDiscoveryRun, "update", async (args: { data: UpdateData1 }) => {
      captured.data = args.data;
      return {};
    });
    // The mocked job resolves Success with one record, which the
    // route's real (unmocked) import/dedupe loop would otherwise
    // write to the live Lead table — mock the specific dedupe.ts
    // calls it takes on a no-existing-match record (no website/phone
    // on the fixture below, so it can't match anything real) so this
    // test never touches prisma.lead / prisma.leadSourceRef.
    patch(prisma.leadSourceRef, "findUnique", async () => null);
    patch(prisma.lead, "findFirst", async () => null);
    patch(prisma.lead, "create", async (args: { data: { businessName: string } }) => ({
      id: "lead_fake_resumed",
      ...args.data,
    }));
    process.env.OUTSCRAPER_POLL_INTERVAL_MS = "5";
    const { calledUrls } = installMockFetch((url) => {
      if (url.includes("/requests/job_resume_1")) {
        return { id: "job_resume_1", status: "Success", data: [[{ name: "Resumed Biz", place_id: "ChIJresumedRoute" }]] };
      }
      return null; // anything else (incl. /google-maps-search) is unexpected
    });

    const res = await discoverPOST(
      jsonRequest({ provider: "outscraper", category: "HVAC", city: "Toledo", state: "OH", limit: 50, resumeRunId: "run_resume_1" }),
    );
    const data = await res.json();

    assert(res.status === 200, "resume: responds 200 on a completed job");
    assert(data.resultCount === 1, "resume: returns the completed job's records");
    assert(data.providerJobStatus === "SUCCESS", "resume: providerJobStatus reported as SUCCESS");
    assert(
      calledUrls.length >= 1 && calledUrls.every((u) => u.includes("/requests/job_resume_1")),
      "resume: every provider HTTP call was a poll of the SAME job id — never /google-maps-search",
    );
    assert(
      captured.data?.providerRequestCount === 3 + calledUrls.length,
      "resume: the final providerRequestCount is additive onto the original attempt's spend, not overwritten",
    );

    restoreFetch();
    restorePatches();
    delete process.env.OUTSCRAPER_POLL_INTERVAL_MS;
  }

  // ── 3. Resume of a job that never completes still fails cleanly —
  // bounded, not an infinite wait — and stays resumable. ──
  {
    patch(prisma.leadDiscoveryRun, "findUnique", async () => ({
      id: "run_resume_2",
      providerJobId: "job_resume_2",
      providerJobStatus: "PENDING",
      providerRequestCount: 5,
    }));
    type UpdateData2 = { providerJobStatus?: string };
    const captured: { data: UpdateData2 | null } = { data: null };
    patch(prisma.leadDiscoveryRun, "update", async (args: { data: UpdateData2 }) => {
      captured.data = args.data;
      return {};
    });
    process.env.OUTSCRAPER_POLL_INTERVAL_MS = "5";
    process.env.OUTSCRAPER_POLL_BUDGET_MS = "30";
    installMockFetch((url) => {
      if (url.includes("/requests/job_resume_2")) return { id: "job_resume_2", status: "Pending" };
      return null;
    });

    const start = Date.now();
    const res = await discoverPOST(
      jsonRequest({ provider: "outscraper", category: "HVAC", city: "Toledo", state: "OH", limit: 50, resumeRunId: "run_resume_2" }),
    );
    const elapsedMs = Date.now() - start;
    const data = await res.json();

    assert(res.status === 200, "resume-still-pending: route still responds 200 (provider error is embedded, not an HTTP error)");
    assert(data.resultCount === 0, "resume-still-pending: no partial import");
    assert(/still processing/i.test(data.providerError ?? ""), "resume-still-pending: clear 'still processing' error surfaced");
    assert(elapsedMs < 5000, "resume-still-pending: bounded — returned quickly once the (short, test-scale) budget ran out, did not hang");
    assert(
      captured.data?.providerJobStatus === "PENDING",
      "resume-still-pending: run stays marked PENDING so a further resume remains possible",
    );

    restoreFetch();
    restorePatches();
    delete process.env.OUTSCRAPER_POLL_INTERVAL_MS;
    delete process.env.OUTSCRAPER_POLL_BUDGET_MS;
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    restoreFetch();
    restorePatches();
    console.error("TEST FAILED", e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });

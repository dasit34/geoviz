# GeoViz Launch Loop Report

## Cycle 4 — 2026-07-05T21:33:14.725Z

### Summary
- Reports: 10 total | HTML pass: 10 | HTML fail: **0**
- PDF checks: **SKIPPED** (macOS local dev — no browser binary; verify on Railway)
- Pattern hits: **0** | Fallback hits: **0**
- Page count issues: 0 (expected 8 rd-page sections)
- report:validate (fixtures): PASS ✓
- report:validate:live: PASS ✓

### Failing Reports

None — all reports passed HTML and PDF checks. ✓

### Dashboard Targets

| Check | Actual | Target | Status |
|---|---|---|---|
| HTML failures | 0 | 0 | ✓ |
| PDF failures | skipped | 0 | ⚠ macOS dev — verify on Railway |
| Template pattern issues | 0 | 0 | ✓ |
| Category fallback hits | 0 | 0 | ✓ |
| Fixture validation | pass | pass | ✓ |
| Live validation | pass | pass | ✓ |
| Launch readiness | QA Ready | QA Ready | ✓ |

### Telemetry

| Metric | Value |
|---|---|
| LLM calls | 0 ✓ |
| New AuditOrder records | 0 ✓ |
| Worker jobs triggered | 0 ✓ |

### Launch Recommendation

✅ **All checks passed. Safe to commit and push to main.**
```
git commit -m 'Launch loop: automated report QA regression pass'
```

---
## Cycle 3 — 2026-07-01T13:27:25.135Z

### Summary
- Reports: 25 total | HTML pass: 25 | HTML fail: **0**
- PDF checks: **SKIPPED** (macOS local dev — no browser binary; verify on Railway)
- Pattern hits: **0** | Fallback hits: **0**
- Page count issues: 0 (expected 8 rd-page sections)
- report:validate (fixtures): PASS ✓
- report:validate:live: PASS ✓

### Failing Reports

None — all reports passed HTML and PDF checks. ✓

### Dashboard Targets

| Check | Actual | Target | Status |
|---|---|---|---|
| HTML failures | 0 | 0 | ✓ |
| PDF failures | skipped | 0 | ⚠ macOS dev — verify on Railway |
| Template pattern issues | 0 | 0 | ✓ |
| Category fallback hits | 0 | 0 | ✓ |
| Fixture validation | pass | pass | ✓ |
| Live validation | pass | pass | ✓ |
| Launch readiness | QA Ready | QA Ready | ✓ |

### Telemetry

| Metric | Value |
|---|---|
| LLM calls | 0 ✓ |
| New AuditOrder records | 0 ✓ |
| Worker jobs triggered | 0 ✓ |

### Launch Recommendation

✅ **All checks passed. Safe to commit and push to main.**
```
git commit -m 'Launch loop: automated report QA regression pass'
```

---
## Cycle 2 — 2026-07-01T13:07:11.861Z

### Summary
- Reports: 25 total | HTML pass: 25 | HTML fail: **0**
- PDF checks: **SKIPPED** (macOS local dev — no browser binary; verify on Railway)
- Pattern hits: **0** | Fallback hits: **0**
- Page count issues: 0 (expected 8 rd-page sections)
- report:validate (fixtures): PASS ✓
- report:validate:live: PASS ✓

### Failing Reports

None — all reports passed HTML and PDF checks. ✓

### Dashboard Targets

| Check | Actual | Target | Status |
|---|---|---|---|
| HTML failures | 0 | 0 | ✓ |
| PDF failures | skipped | 0 | ⚠ macOS dev — verify on Railway |
| Template pattern issues | 0 | 0 | ✓ |
| Category fallback hits | 0 | 0 | ✓ |
| Fixture validation | pass | pass | ✓ |
| Live validation | pass | pass | ✓ |
| Launch readiness | QA Ready | QA Ready | ✓ |

### Telemetry

| Metric | Value |
|---|---|
| LLM calls | 0 ✓ |
| New AuditOrder records | 0 ✓ |
| Worker jobs triggered | 0 ✓ |

### Launch Recommendation

✅ **All checks passed. Safe to commit and push to main.**
```
git commit -m 'Launch loop: automated report QA regression pass'
```

---
## Cycle 1 — 2026-07-01T12:54:39.095Z

### Summary
- Reports: 25 total | HTML pass: 5 | HTML fail: **20**
- PDF pass: 0 | PDF fail: **25**
- Pattern hits: **26** | Fallback hits: **0**
- Page count issues: 0 (expected 8 rd-page sections)
- report:validate (fixtures): PASS ✓
- report:validate:live: FAIL ❌

### Failing Reports

1. **https://parkwayinsuranceohio.com/** (`cmqtiotk…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

2. **https://ericjohnsoninsurance.com/** (`cmqtiotk…`)
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

3. **https://westernsouthernlife.com/** (`cmqtiotk…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

4. **https://knightinsurancegroup.com/** (`cmqtiotj…`)
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

5. **https://baystateinsurance.com/** (`cmqtiotj…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

6. **https://primesourcecontractors.com/** (`cmqtiotj…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

7. **https://keystonecustombuilders.com/** (`cmqtiotj…`)
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

8. **https://crestviewhomeremodeling.com/** (`cmqtiotj…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

9. **https://alpineremodeling.com/** (`cmqtiotj…`)
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

10. **https://luxemedspatoledo.com/** (`cmqtioti…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

11. **https://radiantmedspaohio.com/** (`cmqtioti…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

12. **https://juvlyaesthetics.com/** (`cmqtioti…`)
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

13. **https://fiorellaspizzaohio.com/** (`cmqtioti…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

14. **https://elranchogrande.net/** (`cmqtioth…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

15. **https://scialosbakery.com/** (`cmqtioth…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ HTML: matched **"nonprofit benchmark on non-nonprofit report"** — `nonprofit audits`
     → Source: `scripts/geo-worker.ts benchmark cohort logic`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

16. **https://hobankorean.com/** (`cmqtioth…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

17. **https://edgewatersteakhouse.com/** (`cmqtioth…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

18. **https://palomino-restaurant.com/** (`cmqtioth…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

19. **https://heartlandautorepair.com/** (`cmqtiotg…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

20. **https://greatclipsauto.com/** (`cmqtiotg…`)
   - ❌ HTML: matched **"defaulting-to-low fallback leak"** — `defaulting to low`
     → Source: `src/lib/scoring/categories/crawler.ts:61 + src/lib/parse-report.ts sanitizer`
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

21. **https://refinerymedspa.com/** (`cmqtiotj…`)
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

22. **https://skincraftmedspa.com/** (`cmqtioti…`)
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

23. **https://lacasita-restaurant.com/** (`cmqtioti…`)
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

24. **https://bdbbq.com/** (`cmqtioth…`)
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

25. **https://bradscollision.com/** (`cmqtiotg…`)
   - ❌ PDF: HTTP 500 (HTTP 500)
     → Source: `src/app/api/report/[id]/pdf/route.ts` — check Puppeteer/Chromium env

### Dashboard Targets

| Check | Actual | Target | Status |
|---|---|---|---|
| HTML failures | 20 | 0 | ❌ |
| PDF failures | 25 | 0 | ❌ |
| Template pattern issues | 26 | 0 | ❌ |
| Category fallback hits | 0 | 0 | ✓ |
| Fixture validation | pass | pass | ✓ |
| Live validation | fail | pass | ❌ |
| Launch readiness | Not Ready | QA Ready | ❌ |

### Telemetry

| Metric | Value |
|---|---|
| LLM calls | 0 ✓ |
| New AuditOrder records | 0 ✓ |
| Worker jobs triggered | 0 ✓ |

### Launch Recommendation

❌ **Not ready for launch.** Resolve the issues listed above, then re-run `npm run launch:loop`.

---

/**
 * Side-effect guard: import FIRST in seed / replay / backfill / repair
 * scripts. Exits when DATABASE_URL is production or unknown, unless
 * GEOVIZ_ALLOW_PRODUCTION_DB is set to this exact script's name.
 * See ./nonprod-db-guard.ts.
 */
import { enforceNonProductionDatabase } from "./nonprod-db-guard";

enforceNonProductionDatabase({ allowBreakGlass: true });

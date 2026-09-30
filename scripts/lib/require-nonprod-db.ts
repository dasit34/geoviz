/**
 * Side-effect guard: import FIRST in any test or dev-only script. Exits
 * the process when DATABASE_URL is production or unknown. No override.
 * Also runnable as a CLI for npm pre-hooks:
 *   tsx scripts/lib/require-nonprod-db.ts <label>
 * See ./nonprod-db-guard.ts.
 */
import { enforceNonProductionDatabase } from "./nonprod-db-guard";

enforceNonProductionDatabase({ allowBreakGlass: false });

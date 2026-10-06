import { isMonitoringEnabled } from "../plans";

type Env = Record<string, string | undefined>;

/**
 * Customer-facing Proof Engine surfaces (the dashboard "Proof" tab). Requires
 * monitoring to be on AND its own flag — off everywhere until approved.
 * The operator admin view only needs admin auth + monitoring.
 */
export function isProofEngineEnabled(env: Env = process.env): boolean {
  return isMonitoringEnabled(env) && env.GEO_MODULE_PROOF_ENGINE_ENABLED === "true";
}

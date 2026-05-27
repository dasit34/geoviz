/**
 * Dev-only logger for the AI validator scaffold.
 *
 * Per the scaffold contract: "If schema does not support [persistence],
 * do not migrate yet. Instead return the object and log in dev only."
 * `runAiValidationLayer` returns the result object to the caller; this
 * helper additionally `console.log`s it when `NODE_ENV !== "production"`.
 * In production, this is a no-op until persistence is wired.
 */

import type { ValidationLayerResult } from "./types";

export function devLog(result: ValidationLayerResult): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log("[ai-validators]", JSON.stringify(result, null, 2));
}

/**
 * Perplexity observation provider — v1 mock.
 *
 * Returns a deterministic mock payload via `buildMockObservation`.
 * NO `fetch()`, NO Perplexity SDK call. When real wiring lands in a
 * future PR, this delegate will be replaced with an actual call to
 * Perplexity's API; the `ObservationResult` shape stays the same.
 */

import { buildMockObservation } from "../testing/mockObservation";
import type {
  ObservationProvider,
  ObservationResult,
} from "../types";

export const perplexityProvider: ObservationProvider = {
  id: "perplexity",
  async observe(input): Promise<ObservationResult> {
    return buildMockObservation("perplexity", input);
  },
};

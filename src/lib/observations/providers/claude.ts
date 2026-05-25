/**
 * Claude observation provider — v1 mock.
 *
 * Returns a deterministic mock payload via `buildMockObservation`.
 * NO `fetch()`, NO Anthropic SDK call. When real wiring lands in a
 * future PR, this delegate will be replaced with an actual call to
 * the Messages API; the `ObservationResult` shape stays the same.
 */

import { buildMockObservation } from "../testing/mockObservation";
import type {
  ObservationProvider,
  ObservationResult,
} from "../types";

export const claudeProvider: ObservationProvider = {
  id: "claude",
  async observe(input): Promise<ObservationResult> {
    return buildMockObservation("claude", input);
  },
};

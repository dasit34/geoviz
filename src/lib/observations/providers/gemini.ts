/**
 * Gemini observation provider — v1 mock.
 *
 * Returns a deterministic mock payload via `buildMockObservation`.
 * NO `fetch()`, NO Google AI SDK call. When real wiring lands in a
 * future PR, this delegate will be replaced with an actual call to
 * Gemini / AI Overviews; the `ObservationResult` shape stays the same.
 */

import { buildMockObservation } from "../testing/mockObservation";
import type {
  ObservationProvider,
  ObservationResult,
} from "../types";

export const geminiProvider: ObservationProvider = {
  id: "gemini",
  async observe(input): Promise<ObservationResult> {
    return buildMockObservation("gemini", input);
  },
};

import { notFound } from "next/navigation";
import { BenchmarkEnginePageSkeleton } from "@/modules/benchmark-engine/page.skeleton";

/**
 * Placeholder route for the future Benchmark Engine product. 404s in
 * production unless GEO_MODULE_BENCHMARK_ENGINE_ENABLED="true" — see
 * src/modules/benchmark-engine/README.md.
 */
export default function BenchmarkEngineFuturePage() {
  if (process.env.GEO_MODULE_BENCHMARK_ENGINE_ENABLED !== "true") {
    notFound();
  }
  return <BenchmarkEnginePageSkeleton />;
}

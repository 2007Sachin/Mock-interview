/**
 * Lightweight latency instrumentation shared by the voice hooks and the
 * interview room. See README "Voice latency timings" for the stage glossary.
 */
export function logTiming(stage: string, startedAt: number) {
  console.info(`[voice-timing] ${stage}: ${Math.round(performance.now() - startedAt)}ms`);
}

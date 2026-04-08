// Wilson score confidence interval.
// Ported from Cerberus (~/dev/cerberus/src/stats.ts).
//
// Wilson is the right default at low n because it's well-behaved at p=0 and
// p=1, unlike the normal approximation which collapses or produces invalid
// intervals at the boundaries. For a reliability panel that runs 5–10 trials,
// the normal approximation is actively misleading; Wilson is the correct
// (and not much harder) choice.
//
// Formula: for k passes in n trials, with z-score z, center and half-width are:
//   center   = (p̂ + z²/2n) / (1 + z²/n)
//   halfWidth = z * √(p̂(1-p̂)/n + z²/4n²) / (1 + z²/n)
// where p̂ = k/n.

export interface ConfidenceInterval {
  low: number;  // 0..1
  high: number; // 0..1
}

const Z_95 = 1.96;

export function wilsonCI(passes: number, trials: number): ConfidenceInterval {
  if (trials === 0) return { low: 0, high: 0 };

  const p = passes / trials;
  const z = Z_95;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const halfWidth =
    (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denom;

  return {
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
  };
}

// Label an interval by width. The thresholds are calibrated so that a typical
// reliability panel at n=5 lands in LOW (reminding the reviewer that 5 is not
// enough to commit to a claim), n≈30 lands in MED, n≈200 lands in HIGH.
export function confidenceLabel(ci: ConfidenceInterval): "LOW" | "MED" | "HIGH" {
  const width = ci.high - ci.low;
  if (width > 0.30) return "LOW";
  if (width > 0.10) return "MED";
  return "HIGH";
}

/** Round trees-cleared quantities to two decimal places (API may send more precision). */
export function roundTreesCleared(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/** Display string for trees cleared — always two fractional digits (e.g. 128.45, 0.00). */
export function formatTreesCleared(n: number): string {
  return roundTreesCleared(n).toFixed(2)
}

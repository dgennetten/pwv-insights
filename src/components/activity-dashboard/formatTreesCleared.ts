import { formatDecimal, formatInteger } from '../../lib/formatNumber'

/** Round trees-cleared quantities to two decimal places (API may send more precision). */
export function roundTreesCleared(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/** Whole-tree counts (org-wide totals, per-patrol on trail detail). */
export function roundWholeTreesCleared(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

/** Member-scoped shares use 2dp; org-wide uses whole trees. */
export function roundTreesClearedForScope(n: number, memberScoped: boolean): number {
  return memberScoped ? roundTreesCleared(n) : roundWholeTreesCleared(n)
}

/** Display string for individual member totals — always two fractional digits (e.g. 1,128.45). */
export function formatTreesCleared(n: number): string {
  return formatDecimal(roundTreesCleared(n), 2, 2)
}

/** Display string for whole-tree counts (no fractional digits; grouped). */
export function formatTreesClearedWhole(n: number): string {
  return formatInteger(roundWholeTreesCleared(n))
}

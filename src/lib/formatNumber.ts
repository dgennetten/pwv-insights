/** Locale for grouped number display across the app (e.g. 12,345). */
export const DISPLAY_NUMBER_LOCALE = 'en-US' as const

/** Whole numbers with thousands separators. */
export function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat(DISPLAY_NUMBER_LOCALE, { maximumFractionDigits: 0 }).format(Math.round(n))
}

/** Grouped number with fixed fractional digits (e.g. 1,234.56). */
export function formatDecimal(n: number, minFractionDigits: number, maxFractionDigits: number): string {
  if (!Number.isFinite(n)) {
    return new Intl.NumberFormat(DISPLAY_NUMBER_LOCALE, {
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: maxFractionDigits,
    }).format(0)
  }
  return new Intl.NumberFormat(DISPLAY_NUMBER_LOCALE, {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(n)
}

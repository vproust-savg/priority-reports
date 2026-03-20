// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/formatters.ts
// PURPOSE: Formatting functions for currency, dates, numbers, percents.
//          Used by all widgets to ensure consistent display.
// USED BY: ReportTableWidget
// EXPORTS: formatCurrency, formatNumber, formatDate, formatPercent, formatCellValue
// ═══════════════════════════════════════════════════════════════

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatCurrency(value: number): string {
  // WHY: Negative currency in parentheses is accounting standard
  // and matches the Priority ERP display convention.
  if (value < 0) {
    return `(${currencyFormatter.format(Math.abs(value))})`;
  }
  return currencyFormatter.format(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}

export function formatCellValue(
  value: unknown,
  columnType: string,
): { formatted: string; isNegative: boolean } {
  if (value === null || value === undefined) {
    return { formatted: '—', isNegative: false };
  }

  switch (columnType) {
    case 'currency':
      return {
        formatted: formatCurrency(value as number),
        isNegative: (value as number) < 0,
      };
    case 'number':
      return { formatted: formatNumber(value as number), isNegative: false };
    case 'date':
      return { formatted: formatDate(value as string), isNegative: false };
    case 'percent':
      return {
        formatted: formatPercent(value as number),
        isNegative: (value as number) < 0,
      };
    default:
      return { formatted: String(value), isNegative: false };
  }
}

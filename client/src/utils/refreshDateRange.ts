// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/refreshDateRange.ts
// PURPOSE: Derive an inclusive source refresh range from the Date filter.
// USED BY: ReportTableWidget
// EXPORTS: getRefreshDateRange
// ═══════════════════════════════════════════════════════════════

import { CALENDAR_DAY_MS, parseRefreshDate, validateRefreshDateRange } from '@shared/utils/refreshDateRange';
import type { RefreshDateRangeResult } from '@shared/utils/refreshDateRange';
import type { FilterGroup } from '@shared/types';

function containsDate(group: FilterGroup): boolean {
  return group.conditions.some(condition => condition.field === 'date') || group.groups.some(containsDate);
}

export function getRefreshDateRange(group: FilterGroup, today: string): RefreshDateRangeResult | { reason: 'ambiguousDates' } {
  const dates = group.conditions.filter(condition => condition.field === 'date');
  if (group.conjunction !== 'and' || dates.length === 0) return { reason: 'invalidDates' };
  if (dates.length > 1 || group.groups.some(containsDate)) return { reason: 'ambiguousDates' };

  const { operator, value, valueTo } = dates[0];
  switch (operator) {
    case 'isBetween':
    case 'isInWeek':
      return validateRefreshDateRange(value, valueTo);
    case 'equals':
      return validateRefreshDateRange(value, value);
    case 'isOnOrAfter':
      return validateRefreshDateRange(value, today);
    case 'isAfter': {
      const start = parseRefreshDate(value);
      if (Number.isNaN(start)) return { reason: 'invalidDates' };
      const nextDay = new Date(start + CALENDAR_DAY_MS).toISOString().split('T')[0];
      return validateRefreshDateRange(nextDay, today);
    }
    default:
      return { reason: 'invalidDates' };
  }
}

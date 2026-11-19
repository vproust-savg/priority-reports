// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/refreshDateRange.ts
// PURPOSE: Derive an inclusive source refresh range from the Date filter.
// USED BY: ReportTableWidget
// EXPORTS: getRefreshDateRange
// ═══════════════════════════════════════════════════════════════

import { CALENDAR_DAY_MS, parseRefreshDate, validateRefreshDateRange } from '@shared/utils/refreshDateRange';
import type { RefreshDateRangeResult } from '@shared/utils/refreshDateRange';
import type { FilterGroup } from '@shared/types';

export function getRefreshDateRange(group: FilterGroup, today: string): RefreshDateRangeResult {
  // WHY: A nested Date condition or an OR root need not constrain every row.
  const date = group.conditions.find((condition) => condition.field === 'date');
  if (group.conjunction !== 'and' || !date) return { reason: 'invalidDates' };

  const { operator, value, valueTo } = date;
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

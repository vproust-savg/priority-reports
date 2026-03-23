// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/weekUtils.ts
// PURPOSE: Re-exports shared week utilities. Keeps existing
//          import paths working without changing every consumer.
// USED BY: WeekPickerDropdown.tsx, FilterConditionRow.tsx,
//          config/filterConstants.ts
// EXPORTS: getMonday, getSunday, toISODate, formatWeekRange,
//          getCalendarWeeks
// ═══════════════════════════════════════════════════════════════

export { getMonday, getSunday, toISODate, formatWeekRange, getCalendarWeeks } from '../../../shared/utils/weekUtils';

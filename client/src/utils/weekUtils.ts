// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/weekUtils.ts
// PURPOSE: Pure date utility functions for week calculations.
//          Used by WeekPicker component and FilterConditionRow
//          for the isInWeek operator.
// USED BY: WeekPickerDropdown.tsx, FilterConditionRow.tsx, config/filterConstants.ts
// EXPORTS: getMonday, getSunday, toISODate, formatWeekRange,
//          getCalendarWeeks
// ═══════════════════════════════════════════════════════════════

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// WHY: ISO 8601 weeks start on Monday. JavaScript's getDay() returns
// 0 for Sunday, so we shift: (day + 6) % 7 makes Monday = 0.
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday = 0, Tuesday = 1, ..., Sunday = 6
  d.setDate(d.getDate() - diff);
  return d;
}

export function getSunday(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// WHY: Three formats depending on whether the week spans months or years:
// Same month:  "Mar 16–22, 2026"
// Cross month: "Mar 30 – Apr 5, 2026"
// Cross year:  "Dec 29, 2025 – Jan 4, 2026"
export function formatWeekRange(monday: Date, sunday: Date): string {
  const mMonth = MONTHS[monday.getMonth()];
  const sMonth = MONTHS[sunday.getMonth()];
  const mDay = monday.getDate();
  const sDay = sunday.getDate();
  const mYear = monday.getFullYear();
  const sYear = sunday.getFullYear();

  if (mYear !== sYear) {
    return `${mMonth} ${mDay}, ${mYear} – ${sMonth} ${sDay}, ${sYear}`;
  }
  if (monday.getMonth() !== sunday.getMonth()) {
    return `${mMonth} ${mDay} – ${sMonth} ${sDay}, ${sYear}`;
  }
  return `${mMonth} ${mDay}–${sDay}, ${mYear}`;
}

// WHY: Always 6 rows to keep dropdown height consistent regardless of
// which month is displayed. First row starts from the Monday on or
// before the 1st of the month.
export function getCalendarWeeks(year: number, month: number): Date[][] {
  const firstOfMonth = new Date(year, month, 1);
  const startMonday = getMonday(firstOfMonth);

  const weeks: Date[][] = [];
  const current = new Date(startMonday);

  for (let row = 0; row < 6; row++) {
    const week: Date[] = [];
    for (let col = 0; col < 7; col++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

# Week Filter Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `isInWeek` date filter operator with a custom WeekPicker dropdown, so users can filter any date column to a Monday–Sunday week.

**Architecture:** `isInWeek` stores Monday + Sunday dates (identical to `isBetween`), so all three filter engines reuse existing range logic via switch fallthrough. The only substantial new code is `weekUtils.ts` (pure date helpers) and `WeekPicker.tsx` (dropdown calendar). Seven files get one-line additions.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, Vitest, Zod

**Spec:** `specs/07-week-filter/spec-07-week-filter.md`

---

## File Map

| File | Action | Lines | Responsibility |
|------|--------|-------|---------------|
| `shared/types/filters.ts` | Modify | +1 | Add `'isInWeek'` to FilterOperator union |
| `server/src/routes/querySchemas.ts` | Modify | +1 | Add `'isInWeek'` to Zod enum |
| `server/src/services/odataFilterBuilder.ts` | Modify | +1 | Fallthrough case before `isBetween` |
| `server/src/services/serverClientFilter.ts` | Modify | +1 | Fallthrough case before `isBetween` |
| `client/src/utils/clientFilter.ts` | Modify | +1 | Fallthrough case before `isBetween` |
| `client/src/config/filterConstants.ts` | Modify | +1 | Add operator to date list |
| `client/src/utils/weekUtils.ts` | **Create** | ~65 | Pure date helpers (getMonday, getSunday, etc.) |
| `client/src/utils/weekUtils.test.ts` | **Create** | ~90 | Unit tests for week utilities |
| `client/src/components/filter/WeekPicker.tsx` | **Create** | ~140 | Dropdown week picker component |
| `client/src/components/filter/FilterValueInput.tsx` | Modify | +8 | Render WeekPicker for isInWeek |
| `client/src/components/filter/FilterConditionRow.tsx` | Modify | +10 | Pre-populate current week on operator change |

---

## Task 1: Add `isInWeek` to shared types and Zod schema

**Files:**
- Modify: `shared/types/filters.ts:24`
- Modify: `server/src/routes/querySchemas.ts:18`

- [ ] **Step 1: Add `isInWeek` to FilterOperator union**

In `shared/types/filters.ts`, change line 24 from:
```typescript
  | 'isBefore' | 'isAfter' | 'isOnOrBefore' | 'isOnOrAfter' | 'isBetween'
```
to:
```typescript
  | 'isBefore' | 'isAfter' | 'isOnOrBefore' | 'isOnOrAfter' | 'isBetween' | 'isInWeek'
```

- [ ] **Step 2: Update valueTo comment**

In `shared/types/filters.ts`, change line 35 from:
```typescript
  valueTo?: string;          // Second value for 'between' / 'isBetween' operators
```
to:
```typescript
  valueTo?: string;          // Second value for 'between' / 'isBetween' / 'isInWeek' operators
```

- [ ] **Step 3: Add `isInWeek` to Zod enum**

In `server/src/routes/querySchemas.ts`, change line 18 from:
```typescript
    'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween',
```
to:
```typescript
    'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isInWeek',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add shared/types/filters.ts server/src/routes/querySchemas.ts
git commit -m "feat: add isInWeek to FilterOperator type and Zod schema"
```

---

## Task 2: Add filter engine fallthrough cases

**Files:**
- Modify: `server/src/services/odataFilterBuilder.ts:63`
- Modify: `server/src/services/serverClientFilter.ts:51`
- Modify: `client/src/utils/clientFilter.ts:59`

All three files get the same one-line change: add `case 'isInWeek':` before `case 'isBetween':` so it falls through to the existing date range logic. Empty case bodies are allowed by TypeScript even with `noFallthroughCasesInSwitch: true`.

- [ ] **Step 1: Add fallthrough in OData filter builder**

In `server/src/services/odataFilterBuilder.ts`, change line 63 from:
```typescript
    case 'isBetween': {
```
to:
```typescript
    case 'isInWeek': // WHY: Falls through — isInWeek stores Monday/Sunday, same range as isBetween
    case 'isBetween': {
```

- [ ] **Step 2: Add fallthrough in server client filter**

In `server/src/services/serverClientFilter.ts`, change line 51 from:
```typescript
    case 'isBetween': {
```
to:
```typescript
    case 'isInWeek': // Falls through — same date range check as isBetween
    case 'isBetween': {
```

- [ ] **Step 3: Add fallthrough in client filter**

In `client/src/utils/clientFilter.ts`, change line 59 from:
```typescript
    case 'isBetween': {
```
to:
```typescript
    case 'isInWeek': // Falls through — same date range check as isBetween
    case 'isBetween': {
```

- [ ] **Step 4: Verify both sides compile**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run existing server tests**

Run: `cd server && npm test`
Expected: All tests pass (no behavior change for existing operators)

- [ ] **Step 6: Commit**

```bash
git add server/src/services/odataFilterBuilder.ts server/src/services/serverClientFilter.ts client/src/utils/clientFilter.ts
git commit -m "feat: add isInWeek fallthrough to all three filter engines"
```

---

## Task 3: Add `isInWeek` to frontend operator list

**Files:**
- Modify: `client/src/config/filterConstants.ts:45-47`

- [ ] **Step 1: Add operator entry**

In `client/src/config/filterConstants.ts`, change lines 45-47 from:
```typescript
    { value: 'isBetween', label: 'is between' },
    { value: 'isEmpty', label: 'is empty' },
```
to:
```typescript
    { value: 'isBetween', label: 'is between' },
    { value: 'isInWeek', label: 'is in week' },
    { value: 'isEmpty', label: 'is empty' },
```

- [ ] **Step 2: Verify client compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/config/filterConstants.ts
git commit -m "feat: add isInWeek to date operator list in filterConstants"
```

---

## Task 4: Create week utility functions (TDD)

**Files:**
- Create: `client/src/utils/weekUtils.ts`
- Create: `client/src/utils/weekUtils.test.ts`

- [ ] **Step 1: Write the tests first**

Create `client/src/utils/weekUtils.test.ts`:
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/weekUtils.test.ts
// PURPOSE: Unit tests for week date utility functions.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { getMonday, getSunday, toISODate, formatWeekRange, getCalendarWeeks } from './weekUtils';

describe('getMonday', () => {
  it('returns the same date when given a Monday', () => {
    // 2026-03-16 is a Monday
    const result = getMonday(new Date(2026, 2, 16));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(16);
  });

  it('returns the preceding Monday when given a Wednesday', () => {
    // 2026-03-18 is a Wednesday → Monday is 2026-03-16
    const result = getMonday(new Date(2026, 2, 18));
    expect(result.getDate()).toBe(16);
  });

  it('returns the Monday 6 days prior when given a Sunday', () => {
    // 2026-03-22 is a Sunday → Monday is 2026-03-16
    const result = getMonday(new Date(2026, 2, 22));
    expect(result.getDate()).toBe(16);
  });

  it('handles month boundary (Sunday in next month)', () => {
    // 2026-04-01 is a Wednesday → Monday is 2026-03-30
    const result = getMonday(new Date(2026, 3, 1));
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(30);
  });

  it('handles year boundary', () => {
    // 2026-01-01 is a Thursday → Monday is 2025-12-29
    const result = getMonday(new Date(2026, 0, 1));
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(29);
  });
});

describe('getSunday', () => {
  it('returns 6 days after Monday', () => {
    const monday = new Date(2026, 2, 16); // March 16
    const result = getSunday(monday);
    expect(result.getDate()).toBe(22); // March 22
  });

  it('handles month boundary', () => {
    const monday = new Date(2026, 2, 30); // March 30
    const result = getSunday(monday);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(5);  // April 5
  });
});

describe('toISODate', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(toISODate(new Date(2026, 2, 16))).toBe('2026-03-16');
  });

  it('pads single-digit month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatWeekRange', () => {
  it('formats same-month week', () => {
    const mon = new Date(2026, 2, 16); // Mar 16
    const sun = new Date(2026, 2, 22); // Mar 22
    expect(formatWeekRange(mon, sun)).toBe('Mar 16–22, 2026');
  });

  it('formats cross-month week', () => {
    const mon = new Date(2026, 2, 30); // Mar 30
    const sun = new Date(2026, 3, 5);  // Apr 5
    expect(formatWeekRange(mon, sun)).toBe('Mar 30 – Apr 5, 2026');
  });

  it('formats cross-year week', () => {
    const mon = new Date(2025, 11, 29); // Dec 29, 2025
    const sun = new Date(2026, 0, 4);   // Jan 4, 2026
    expect(formatWeekRange(mon, sun)).toBe('Dec 29, 2025 – Jan 4, 2026');
  });
});

describe('getCalendarWeeks', () => {
  it('returns exactly 6 rows of 7 dates', () => {
    const weeks = getCalendarWeeks(2026, 2); // March 2026
    expect(weeks).toHaveLength(6);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
  });

  it('first date is always a Monday', () => {
    const weeks = getCalendarWeeks(2026, 2); // March 2026
    expect(weeks[0][0].getDay()).toBe(1); // Monday
  });

  it('last date in each row is always a Sunday', () => {
    const weeks = getCalendarWeeks(2026, 2);
    for (const week of weeks) {
      expect(week[6].getDay()).toBe(0); // Sunday
    }
  });

  it('covers the entire displayed month', () => {
    const weeks = getCalendarWeeks(2026, 2); // March 2026
    const allDates = weeks.flat();
    // March 1 and March 31 should be in the grid
    expect(allDates.some((d) => d.getMonth() === 2 && d.getDate() === 1)).toBe(true);
    expect(allDates.some((d) => d.getMonth() === 2 && d.getDate() === 31)).toBe(true);
  });

  it('handles month starting on Monday (June 2026)', () => {
    // June 1, 2026 is a Monday — first row starts on June 1
    const weeks = getCalendarWeeks(2026, 5);
    expect(weeks[0][0].getMonth()).toBe(5); // June
    expect(weeks[0][0].getDate()).toBe(1);
  });

  it('handles month starting on Sunday (March 2026)', () => {
    // March 1, 2026 is a Sunday — first row starts on Feb 23 (Monday)
    const weeks = getCalendarWeeks(2026, 2);
    expect(weeks[0][0].getMonth()).toBe(1); // February
    expect(weeks[0][0].getDate()).toBe(23);
  });

  it('handles February in leap year', () => {
    // Feb 2028 — leap year, Feb 29 exists
    const weeks = getCalendarWeeks(2028, 1);
    const allDates = weeks.flat();
    expect(allDates.some((d) => d.getMonth() === 1 && d.getDate() === 29)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/utils/weekUtils.test.ts`
Expected: FAIL — module `./weekUtils` not found

- [ ] **Step 3: Create the implementation**

Create `client/src/utils/weekUtils.ts`:
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/weekUtils.ts
// PURPOSE: Pure date utility functions for week calculations.
//          Used by WeekPicker component and FilterConditionRow
//          for the isInWeek operator.
// USED BY: WeekPicker.tsx, FilterConditionRow.tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/utils/weekUtils.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/weekUtils.ts client/src/utils/weekUtils.test.ts
git commit -m "feat: create weekUtils with TDD — getMonday, getSunday, formatWeekRange, getCalendarWeeks"
```

---

## Task 5: Create WeekPicker component

**Files:**
- Create: `client/src/components/filter/WeekPicker.tsx`

- [ ] **Step 1: Create the WeekPicker component**

Create `client/src/components/filter/WeekPicker.tsx`:
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/WeekPicker.tsx
// PURPOSE: Dropdown week picker with mini calendar. Selects a
//          Mon–Sun week range. Used for the isInWeek filter operator.
// USED BY: FilterValueInput.tsx
// EXPORTS: WeekPicker
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { FILTER_INPUT_CLASS } from '../../config/filterConstants';
import {
  getMonday, getSunday, toISODate, formatWeekRange, getCalendarWeeks,
} from '../../utils/weekUtils';

interface WeekPickerProps {
  value: string;
  valueTo?: string;
  onChange: (monday: string, sunday: string) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export default function WeekPicker({ value, valueTo, onChange }: WeekPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // WHY: displayMonth tracks which month the calendar shows, independent
  // of the selected week. Defaults to the selected week's month or today.
  const [displayMonth, setDisplayMonth] = useState(() => {
    if (value) return new Date(value + 'T00:00:00');
    return new Date();
  });
  const [hoveredMonday, setHoveredMonday] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside closes dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Escape key closes dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const selectWeek = (monday: Date) => {
    const sunday = getSunday(monday);
    onChange(toISODate(monday), toISODate(sunday));
    setTimeout(() => setIsOpen(false), 150);
  };

  const today = new Date();
  const thisMonday = getMonday(today);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  const weeks = getCalendarWeeks(displayMonth.getFullYear(), displayMonth.getMonth());
  const todayISO = toISODate(today);

  // Display label
  const label = value && valueTo
    ? formatWeekRange(new Date(value + 'T00:00:00'), new Date(valueTo + 'T00:00:00'))
    : 'Select week...';

  const prevMonth = () => setDisplayMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setDisplayMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const isShortcutActive = (monday: Date) => value === toISODate(monday);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${FILTER_INPUT_CLASS} w-52 flex items-center gap-2 cursor-pointer`}
      >
        <Calendar size={16} className="text-slate-400 shrink-0" />
        <span className={`flex-1 text-left truncate ${!value ? 'text-slate-400' : ''}`}>
          {label}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-white rounded-xl
          border border-slate-200 shadow-lg p-3 transition-all duration-150"
        >
          {/* Shortcuts */}
          <div className="flex gap-2 mb-3">
            {[
              { label: 'This week', monday: thisMonday },
              { label: 'Last week', monday: lastMonday },
            ].map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => selectWeek(shortcut.monday)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors
                  ${isShortcutActive(shortcut.monday)
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary'
                  }`}
              >
                {shortcut.label}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-800">
              {MONTHS[displayMonth.getMonth()]} {displayMonth.getFullYear()}
            </span>
            <button type="button" onClick={nextMonth}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-[10px] uppercase tracking-wider text-slate-400 font-medium text-center">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div>
            {weeks.map((week) => {
              const weekMonday = toISODate(week[0]);
              const weekSunday = toISODate(week[6]);
              const isSelected = value === weekMonday && valueTo === weekSunday;
              const isHovered = hoveredMonday === weekMonday;

              return (
                <div
                  key={weekMonday}
                  onClick={() => selectWeek(week[0])}
                  onMouseEnter={() => setHoveredMonday(weekMonday)}
                  onMouseLeave={() => setHoveredMonday(null)}
                  className={`grid grid-cols-7 cursor-pointer rounded-lg transition-colors
                    ${isSelected ? 'bg-primary/10' : isHovered ? 'bg-primary/5' : ''}`}
                >
                  {week.map((date, i) => {
                    const dateISO = toISODate(date);
                    const isCurrentMonth = date.getMonth() === displayMonth.getMonth();
                    const isToday = dateISO === todayISO;
                    const isSelectedEndpoint = isSelected && (i === 0 || i === 6);
                    const isSelectedMiddle = isSelected && i > 0 && i < 6;

                    return (
                      <div
                        key={dateISO}
                        className={`h-7 flex items-center justify-center text-xs transition-colors
                          ${isSelectedEndpoint
                            ? `bg-primary text-white ${i === 0 ? 'rounded-l-full' : 'rounded-r-full'}`
                            : isSelectedMiddle
                              ? 'bg-primary/15 text-primary'
                              : isCurrentMonth
                                ? 'text-slate-600'
                                : 'text-slate-300'
                          }
                          ${isToday && !isSelectedEndpoint ? 'ring-1 ring-primary/30 rounded-full' : ''}
                        `}
                      >
                        {date.getDate()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify client compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/filter/WeekPicker.tsx
git commit -m "feat: create WeekPicker dropdown component with calendar grid"
```

---

## Task 6: Integrate WeekPicker into FilterValueInput

**Files:**
- Modify: `client/src/components/filter/FilterValueInput.tsx:9-10,51-52`

- [ ] **Step 1: Add WeekPicker import**

In `client/src/components/filter/FilterValueInput.tsx`, add after line 10 (after the `FILTER_INPUT_CLASS` import):
```typescript
import WeekPicker from './WeekPicker';
```

- [ ] **Step 2: Add isInWeek rendering branch**

In `FilterValueInput.tsx`, inside the `if (column.filterType === 'date')` block (after line 51), add this BEFORE the `if (isBetweenOp)` check:
```typescript
    if (operator === 'isInWeek') {
      return (
        <WeekPicker
          value={value}
          valueTo={valueTo}
          onChange={(monday, sunday) => onChange(monday, sunday)}
        />
      );
    }
```

So the date block becomes:
```typescript
  if (column.filterType === 'date') {
    if (operator === 'isInWeek') {
      return (
        <WeekPicker
          value={value}
          valueTo={valueTo}
          onChange={(monday, sunday) => onChange(monday, sunday)}
        />
      );
    }
    if (isBetweenOp) {
      // existing isBetween code unchanged...
```

- [ ] **Step 3: Verify client compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/filter/FilterValueInput.tsx
git commit -m "feat: render WeekPicker in FilterValueInput for isInWeek operator"
```

---

## Task 7: Pre-populate current week in FilterConditionRow

**Files:**
- Modify: `client/src/components/filter/FilterConditionRow.tsx:9,85`

- [ ] **Step 1: Add weekUtils import**

In `client/src/components/filter/FilterConditionRow.tsx`, add after line 14 (after the `CSS` import from `@dnd-kit/utilities`):
```typescript
import { getMonday, getSunday, toISODate } from '../../utils/weekUtils';
```

- [ ] **Step 2: Replace inline operator change handler with pre-population logic**

In `FilterConditionRow.tsx`, replace the operator `<select>` onChange at line 85 from:
```typescript
          onChange={(e) => onChange({ ...condition, operator: e.target.value as FilterCondition['operator'], value: '', valueTo: undefined })}
```
to:
```typescript
          onChange={(e) => {
            const newOp = e.target.value as FilterCondition['operator'];
            // WHY: Pre-populate isInWeek with current week so the user sees
            // results immediately. All other operators reset to blank.
            if (newOp === 'isInWeek') {
              const monday = getMonday(new Date());
              onChange({ ...condition, operator: newOp, value: toISODate(monday), valueTo: toISODate(getSunday(monday)) });
            } else {
              onChange({ ...condition, operator: newOp, value: '', valueTo: undefined });
            }
          }}
```

- [ ] **Step 3: Verify client compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/filter/FilterConditionRow.tsx
git commit -m "feat: pre-populate current week when operator changes to isInWeek"
```

---

## Task 8: Final verification

- [ ] **Step 1: TypeScript compiles — both sides**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: All server tests pass**

Run: `cd server && npm test`
Expected: All existing tests pass

- [ ] **Step 3: Week utility tests pass**

Run: `cd client && npx vitest run src/utils/weekUtils.test.ts`
Expected: All 13 tests pass

- [ ] **Step 4: Visual verification**

Start dev server: `cd client && npm run dev` (assumes backend running on port 3001)

Manual checks:
1. Open any report → Filter → select a date column → operator dropdown shows "is in week"
2. Select "is in week" → WeekPicker appears with current week pre-selected → results filter
3. Click WeekPicker trigger → dropdown opens with "This week" / "Last week" shortcuts
4. Hover over week rows → entire row highlights with subtle blue
5. Click a week → dropdown closes, trigger updates, results update
6. Navigate months with arrows → calendar updates
7. Weeks at month boundaries show dimmed but clickable days from adjacent months
8. "This week" shortcut highlights when current week is selected
9. Switch back to "is between" operator → dual date inputs work as before
10. All other date operators still work unchanged

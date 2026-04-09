// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/WeekPickerDropdown.tsx
// PURPOSE: Dropdown panel for WeekPicker — shortcuts, month nav,
//          and calendar grid with week-row selection.
// USED BY: WeekPicker.tsx
// EXPORTS: WeekPickerDropdown
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getMonday, toISODate, getCalendarWeeks,
} from '../../utils/weekUtils';

interface WeekPickerDropdownProps {
  value: string;
  valueTo?: string;
  displayMonth: Date;
  onDisplayMonthChange: (date: Date) => void;
  onSelect: (monday: Date) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export default function WeekPickerDropdown({
  value, valueTo, displayMonth, onDisplayMonthChange, onSelect,
}: WeekPickerDropdownProps) {
  const [hoveredMonday, setHoveredMonday] = useState<string | null>(null);

  const today = new Date();
  const thisMonday = getMonday(today);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  const weeks = getCalendarWeeks(displayMonth.getFullYear(), displayMonth.getMonth());
  const todayISO = toISODate(today);

  const prevMonth = () => onDisplayMonthChange(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1));
  const nextMonth = () => onDisplayMonthChange(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1));

  const isShortcutActive = (monday: Date) => value === toISODate(monday);

  return (
    <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-[var(--color-bg-card)] rounded-[var(--radius-xl)]
      border border-[var(--color-gold-subtle)] shadow-[var(--shadow-dropdown)] p-3 transition-all duration-150"
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
            onClick={() => onSelect(shortcut.monday)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors
              ${isShortcutActive(shortcut.monday)
                ? 'bg-[var(--color-gold-primary)]/10 text-[var(--color-gold-primary)] font-semibold'
                : 'bg-[var(--color-gold-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-gold-primary)]/10 hover:text-[var(--color-gold-primary)]'
              }`}
          >
            {shortcut.label}
          </button>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth}
          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {MONTHS[displayMonth.getMonth()]} {displayMonth.getFullYear()}
        </span>
        <button type="button" onClick={nextMonth}
          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium text-center">
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
              onClick={() => onSelect(week[0])}
              onMouseEnter={() => setHoveredMonday(weekMonday)}
              onMouseLeave={() => setHoveredMonday(null)}
              className={`grid grid-cols-7 cursor-pointer rounded-lg transition-colors
                ${isSelected ? 'bg-[var(--color-gold-primary)]/10' : isHovered ? 'bg-[var(--color-gold-primary)]/5' : ''}`}
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
                        ? `bg-[var(--color-dark)] text-white ${i === 0 ? 'rounded-l-full' : 'rounded-r-full'}`
                        : isSelectedMiddle
                          ? 'bg-[var(--color-gold-primary)]/15 text-[var(--color-gold-primary)]'
                          : isCurrentMonth
                            ? 'text-[var(--color-text-secondary)]'
                            : 'text-[var(--color-text-faint)]'
                      }
                      ${isToday && !isSelectedEndpoint ? 'ring-1 ring-[var(--color-gold-primary)]/30 rounded-full' : ''}
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
  );
}

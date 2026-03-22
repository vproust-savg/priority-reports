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
  getMonday, getSunday, toISODate, getCalendarWeeks,
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
            onClick={() => onSelect(shortcut.monday)}
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
              onClick={() => onSelect(week[0])}
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
  );
}

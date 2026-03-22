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

  // WHY: Single useEffect for both close handlers — click outside + Escape.
  // Both depend on isOpen, so merging avoids duplicate listener setup/teardown.
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
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
        onClick={() => {
          // WHY: Sync displayMonth on open so the calendar shows the selected
          // week's month, not whatever month the user last navigated to.
          if (!isOpen && value) setDisplayMonth(new Date(value + 'T00:00:00'));
          setIsOpen(!isOpen);
        }}
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

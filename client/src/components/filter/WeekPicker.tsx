// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/WeekPicker.tsx
// PURPOSE: Dropdown week picker trigger button. Manages open/close
//          state and delegates calendar rendering to WeekPickerDropdown.
// USED BY: FilterValueInput.tsx
// EXPORTS: WeekPicker
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { FILTER_INPUT_CLASS } from '../../config/filterConstants';
import { getSunday, toISODate, formatWeekRange } from '../../utils/weekUtils';
import WeekPickerDropdown from './WeekPickerDropdown';

interface WeekPickerProps {
  value: string;
  valueTo?: string;
  onChange: (monday: string, sunday: string) => void;
}

export default function WeekPicker({ value, valueTo, onChange }: WeekPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // WHY: displayMonth tracks which month the calendar shows, independent
  // of the selected week. Defaults to the selected week's month or today.
  const [displayMonth, setDisplayMonth] = useState(() => {
    if (value) return new Date(value + 'T00:00:00');
    return new Date();
  });
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

  // Display label
  const label = value && valueTo
    ? formatWeekRange(new Date(value + 'T00:00:00'), new Date(valueTo + 'T00:00:00'))
    : 'Select week...';

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

      {isOpen && (
        <WeekPickerDropdown
          value={value}
          valueTo={valueTo}
          displayMonth={displayMonth}
          onDisplayMonthChange={setDisplayMonth}
          onSelect={selectWeek}
        />
      )}
    </div>
  );
}

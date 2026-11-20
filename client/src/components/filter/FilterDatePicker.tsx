import { useState } from 'react';
import { parseDate, today } from '@internationalized/date';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button, Calendar, CalendarCell, CalendarGrid, CalendarGridBody, CalendarGridHeader,
  CalendarHeaderCell, DateInput, DatePicker, DateSegment, Dialog, Group, Heading, Popover,
} from 'react-aria-components';

interface Props {
  label: string;
  value: string;
  onChange: (date: string) => void;
}

function readDate(value: string) {
  try {
    return value ? parseDate(value) : null;
  } catch {
    // Old saved filters can contain an incomplete date.
    return null;
  }
}

export default function FilterDatePicker({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const businessDate = today('America/Los_Angeles');

  function selectDate(date: string) {
    onChange(date);
    setOpen(false);
  }

  return (
    <DatePicker aria-label={label} value={readDate(value)} placeholderValue={businessDate}
      onChange={date => onChange(date?.toString() ?? '')} isOpen={open} onOpenChange={setOpen}>
      <Group className="report-date-field">
        <DateInput className="flex tabular-nums">
          {segment => <DateSegment segment={segment} className="report-date-segment" />}
        </DateInput>
        <Button className="report-date-icon"><CalendarDays size={15} /></Button>
      </Group>
      <Popover placement="bottom start" offset={5} className="report-calendar">
        <Dialog aria-label={label}>
          <Calendar firstDayOfWeek="mon">
            <header className="flex items-center justify-between mb-2">
              <Button slot="previous" className="report-date-icon"><ChevronLeft size={16} /></Button>
              <Heading className="text-sm font-semibold" />
              <Button slot="next" className="report-date-icon"><ChevronRight size={16} /></Button>
            </header>
            <CalendarGrid weekdayStyle="short" className="w-full">
              <CalendarGridHeader>{day => <CalendarHeaderCell>{day}</CalendarHeaderCell>}</CalendarGridHeader>
              <CalendarGridBody>{date => <CalendarCell date={date} className="report-calendar-day" />}</CalendarGridBody>
            </CalendarGrid>
          </Calendar>
          <footer className="mt-2 pt-2 border-t border-gold-subtle flex justify-between">
            <Button onPress={() => selectDate('')}>Clear</Button>
            <Button onPress={() => selectDate(businessDate.toString())}>Today</Button>
          </footer>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function getCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
}

export function CalendarPanel() {
  const today = startOfDay(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today);
  const days = getCalendarDays(visibleMonth);

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectDay = (day: Date) => {
    setSelectedDay(day);
    if (day.getMonth() !== visibleMonth.getMonth()) setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };

  return (
    <div className="calendar-panel" onClick={(event) => event.stopPropagation()}>
      <div className="calendar-panel-body">
        <section className="calendar-month-view" aria-label="Month calendar">
          <div className="calendar-month-toolbar">
            <strong>{monthFormatter.format(visibleMonth)}</strong>
            <div className="calendar-month-actions">
              <button type="button" onClick={() => moveMonth(-1)} title="Previous month" aria-label="Previous month"><ChevronLeft size={13} /></button>
              <button type="button" onClick={() => { setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(today); }} className="calendar-today-button">Today</button>
              <button type="button" onClick={() => moveMonth(1)} title="Next month" aria-label="Next month"><ChevronRight size={13} /></button>
            </div>
          </div>
          <div className="calendar-weekdays">{weekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
          <div className="calendar-grid">
            {days.map((day) => {
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
              const isSelected = sameDay(day, selectedDay);
              return <button type="button" key={day.toISOString()} className={`calendar-day ${isCurrentMonth ? "" : "calendar-day--muted"} ${isSelected ? "calendar-day--selected" : ""} ${sameDay(day, today) ? "calendar-day--today" : ""}`} onClick={() => selectDay(day)} aria-label={dayFormatter.format(day)} aria-pressed={isSelected}><span>{day.getDate()}</span></button>;
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
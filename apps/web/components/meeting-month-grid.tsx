"use client";

import Link from "next/link";
import { useRef } from "react";

import {
  meetingCalendarDayLabel,
  type MeetingCalendarDay,
} from "@/lib/meeting-calendar";

import styles from "./workspace-meetings.module.css";

function href(month: string, day: string): string {
  const value = new URLSearchParams({ day, month });
  return `/workspace/meetings?${value.toString()}`;
}

export function MeetingMonthGrid({
  days,
  month,
  selectedDay,
}: {
  days: MeetingCalendarDay[];
  month: string;
  selectedDay: string;
}) {
  const grid = useRef<HTMLDivElement>(null);

  function move(event: React.KeyboardEvent<HTMLAnchorElement>, index: number) {
    const columns = 7;
    const offset = event.key === "ArrowLeft"
      ? -1
      : event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp"
          ? -columns
          : event.key === "ArrowDown"
            ? columns
            : event.key === "Home"
              ? -(index % columns)
              : event.key === "End"
                ? columns - 1 - (index % columns)
                : 0;
    if (!offset || index + offset < 0 || index + offset >= days.length) return;
    event.preventDefault();
    const cells = Array.from(
      grid.current?.querySelectorAll<HTMLAnchorElement>("[role='gridcell'] > a") ?? [],
    );
    for (const cell of cells) cell.tabIndex = -1;
    const target = cells[index + offset];
    if (target) {
      target.tabIndex = 0;
      target.focus();
    }
  }

  return (
    <div aria-label={`${month} 会议草稿日历`} className={styles.monthGrid} ref={grid} role="grid">
      {Array.from({ length: Math.ceil(days.length / 7) }, (_, week) => (
        <div className={styles.monthRow} key={week} role="row">
          {days.slice(week * 7, week * 7 + 7).map((item, weekIndex) => {
            const index = week * 7 + weekIndex;
            return (
              <div className={styles.dayCell} key={item.date} role="gridcell">
                <Link
                  aria-label={meetingCalendarDayLabel(item)}
                  aria-current={item.date === selectedDay ? "date" : undefined}
                  className={styles.day}
                  data-in-month={item.inMonth}
                  href={href(month, item.date)}
                  onKeyDown={(event) => move(event, index)}
                  tabIndex={item.date === selectedDay ? 0 : -1}
                >
                  <span>{item.day}</span>
                  {item.draftCount ? (
                    <small aria-label={`${item.draftCount} 份待核对草稿`}>
                      {item.draftCount}
                    </small>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

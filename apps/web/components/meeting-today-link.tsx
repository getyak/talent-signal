"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { meetingToday, meetingTodayHref } from "@/lib/meeting-calendar";

function subscribeToLocalDate(notify: () => void) {
  window.addEventListener("focus", notify);
  const timer = window.setInterval(notify, 60_000);
  return () => {
    window.removeEventListener("focus", notify);
    window.clearInterval(timer);
  };
}
const localDate = () => meetingToday(new Date());
const serverDate = () => "";

/** Today follows the device calendar, without rewriting a meeting's time zone. */
export function MeetingTodayLink({ initializeEmpty = false }: { initializeEmpty?: boolean }) {
  const router = useRouter();
  const today = useSyncExternalStore(subscribeToLocalDate, localDate, serverDate);
  useEffect(() => {
    if (initializeEmpty && today) router.replace(meetingTodayHref(today), { scroll: false });
  }, [initializeEmpty, router, today]);
  return <Link href={today ? meetingTodayHref(today) : "/workspace/meetings"} title="返回今天（本机日期）">今天</Link>;
}

export type AttendanceEventLike = {
  event_type: string;
  event_time: string;
  created_at?: string | null;
};

export function getOpenAttendanceSession(events: AttendanceEventLike[], maxOpenHours = 36): AttendanceEventLike | null {
  const sorted = [...events].sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
  let open: AttendanceEventLike | null = null;

  for (const event of sorted) {
    if (event.event_type === "check_in") {
      // Always track the latest check_in. If a previous check_in was never
      // matched by a check_out (orphan from a past day), it should NOT mask
      // a fresh check_in — otherwise the UI thinks there's no open session
      // and shows the wrong action button.
      open = event;
    } else if (event.event_type === "check_out") {
      // 🛡️ A check_out may only close a check_in that already existed when
      // that check_out row was written. HR sometimes pre-writes a manual
      // check_out with a future event_time; that row must not swallow a real
      // punch recorded afterwards (mirrors the server-side rule).
      const writtenAt = event.created_at
        ? new Date(event.created_at).getTime()
        : new Date(event.event_time).getTime();
      const openAt = open ? new Date(open.event_time).getTime() : 0;
      if (!open || writtenAt >= openAt) open = null;
    }
  }

  if (!open) return null;
  const ageMs = Date.now() - new Date(open.event_time).getTime();
  if (ageMs > maxOpenHours * 60 * 60 * 1000) return null;
  return open;
}
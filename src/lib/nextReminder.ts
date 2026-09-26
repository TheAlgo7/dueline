import { hourLabel, mediumDate, todayIn, zoned } from '../core/dates';
import { planNotices, upcomingNotices } from '../core/notify';
import { getState } from './store';

/** "Next reminder: Parking, Tue 29 Sep at 9 AM." or why there won't be one. */
export function nextReminderText(): string {
  const s = getState();
  const active = s.obligations.filter((o) => o.active);
  if (!s.profile || active.length === 0) {
    return 'Reminders are on, but this account has no payments yet. Add one and reminders start.';
  }
  const now = Date.now();
  const [next] = upcomingNotices(planNotices(s.profile, active, s.occs, now, 45), now, 1);
  if (!next) return 'Reminders are on. Nothing is due soon enough to remind you about yet.';
  const tz = s.profile.tz;
  const z = zoned(tz, next.fireAt);
  const today = todayIn(tz);
  const when = z.date === today ? `today at ${hourLabel(z.hour)}` : `${mediumDate(z.date, today)} at ${hourLabel(z.hour)}`;
  return `Reminders are on. Next: ${next.label}, ${when}.`;
}

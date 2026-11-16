// Cache keys for data that keeps changing while the page is open.
//
// A past or future day's data doesn't change (or changes too rarely to matter), so it's
// cached by day: "2026-11-10". Today's keeps growing: new measurements arrive every hour
// and the bay model runs every 6 hours. So today's key also has the current Pacific hour,
// "2026-11-10 14h", and changes each hour: the hooks then load the day again.

import { pacificDateString, toPacific } from '../time/pacific'

/** The cache key for the day containing `time`, given the current time `now`. */
export function dayRefreshKey(time: Date, now: Date): string {
  const day = pacificDateString(time)
  if (day !== pacificDateString(now)) return day
  return `${day} ${toPacific(now).hour}h`
}

/** The day ("2026-11-10") a key from dayRefreshKey stands for. */
export function dayOfKey(key: string): string {
  return key.slice(0, 10)
}

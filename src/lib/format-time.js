const DAY_MS = 86_400_000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days between two dates (0 = same day). */
function calendarDaysBetween(earlier, later) {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);
}

/** "14:05" — time of a single message. */
export function formatMessageTime(iso, locale) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/** Compact timestamp for lists: time today, "Yesterday", weekday this week, otherwise a date. */
export function formatListTimestamp(iso, now = new Date(), locale) {
  const date = new Date(iso);
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return formatMessageTime(iso, locale);
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

/** Heading between days in a message list: "Today", "Yesterday" or a full date. */
export function formatDaySeparator(iso, now = new Date(), locale) {
  const date = new Date(iso);
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

export function isSameDay(a, b) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

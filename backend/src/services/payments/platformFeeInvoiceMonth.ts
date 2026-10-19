/** IST calendar month helpers for platform-fee invoices. */

export function istMonthKey(date: Date): string {
  const dayKey = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return dayKey.slice(0, 7);
}

export function istMonthRangeUtc(monthKey: string): { startInclusive: Date; endExclusive: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    throw Object.assign(new Error('monthKey must be YYYY-MM'), { statusCode: 400 });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw Object.assign(new Error('monthKey must be YYYY-MM'), { statusCode: 400 });
  }
  const startInclusive = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`
  );
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusive = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:30`
  );
  return { startInclusive, endExclusive };
}

/** Previous IST calendar month from `now`. */
export function previousIstMonthKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  let year = Number(parts.find((p) => p.type === 'year')?.value);
  let month = Number(parts.find((p) => p.type === 'month')?.value);
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function istDayOfMonth(now: Date): number {
  return Number(
    now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', day: 'numeric' })
  );
}

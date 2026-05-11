const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

function parseDayMonthYear(text: string, base: Date): { y: number; m: number; d: number } | undefined {
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s*(\d{4})?/i;
  const m = text.match(re);
  if (!m) return undefined;
  const d = parseInt(m[1], 10);
  const monthKey = m[2].toLowerCase();
  const month = MONTHS[monthKey];
  if (typeof month !== 'number') return undefined;
  const y = m[3] ? parseInt(m[3], 10) : base.getFullYear();
  return { y, m: month, d };
}

function parseTime(text: string): { h: number; min: number } | undefined {
  // examples: "8pm", "8:30 pm", "20:15", "tomorrow 10pm"
  const re12 = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
  const r12 = text.match(re12);
  if (r12) {
    let h = parseInt(r12[1], 10);
    const min = r12[2] ? parseInt(r12[2], 10) : 0;
    const ampm = r12[3].toLowerCase();
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return { h, min };
  }
  const re24 = /(\d{1,2}):(\d{2})/;
  const r24 = text.match(re24);
  if (r24) {
    return { h: parseInt(r24[1], 10), min: parseInt(r24[2], 10) };
  }
  return undefined;
}

/**
 * Parse relative date strings like "tomorrow", "today", "day after tomorrow"
 */
function parseRelativeDate(text: string, base: Date): { y: number; m: number; d: number } | undefined {
  const lowerText = text.toLowerCase().trim();
  const today = new Date(base);
  today.setHours(0, 0, 0, 0);
  
  // Handle "today"
  if (lowerText === 'today' || lowerText.startsWith('today ')) {
    return {
      y: today.getFullYear(),
      m: today.getMonth(),
      d: today.getDate()
    };
  }
  
  // Handle "tomorrow"
  if (lowerText === 'tomorrow' || lowerText.startsWith('tomorrow ') || lowerText.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      y: tomorrow.getFullYear(),
      m: tomorrow.getMonth(),
      d: tomorrow.getDate()
    };
  }
  
  // Handle "day after tomorrow" or "day after"
  if (lowerText.includes('day after tomorrow') || lowerText.includes('day after')) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return {
      y: dayAfter.getFullYear(),
      m: dayAfter.getMonth(),
      d: dayAfter.getDate()
    };
  }
  
  // Handle "next week" (7 days from today)
  if (lowerText.includes('next week')) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return {
      y: nextWeek.getFullYear(),
      m: nextWeek.getMonth(),
      d: nextWeek.getDate()
    };
  }
  
  // Handle "next Monday", "next Tuesday", etc.
  const dayOfWeekMatch = lowerText.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (dayOfWeekMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(dayOfWeekMatch[1].toLowerCase());
    if (targetDay !== -1) {
      const result = new Date(today);
      const currentDay = result.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next week if same day or past
      result.setDate(result.getDate() + daysToAdd);
      return {
        y: result.getFullYear(),
        m: result.getMonth(),
        d: result.getDate()
      };
    }
  }
  
  return undefined;
}

export function parseEstimatedDelivery(dateText?: string, timeText?: string, base: Date = new Date()): Date | undefined {
  const dateStr = (dateText || '').toString().trim();
  const timeStr = (timeText || '').toString().trim();
  const combinedText = `${dateStr} ${timeStr}`.trim(); // Combine for parsing mixed formats like "tomorrow 10pm"
  
  const today = new Date(base);
  let y = today.getFullYear();
  let m = today.getMonth();
  let d = today.getDate();

  // Try to parse explicit date (e.g., "15th jan 2024")
  let dateParts = parseDayMonthYear(dateStr, today) || parseDayMonthYear(timeStr, today) || parseDayMonthYear(combinedText, today);
  
  // If no explicit date, try relative dates (e.g., "tomorrow", "today")
  if (!dateParts) {
    dateParts = parseRelativeDate(dateStr, today) || parseRelativeDate(timeStr, today) || parseRelativeDate(combinedText, today);
  }
  
  if (dateParts) {
    y = dateParts.y; m = dateParts.m; d = dateParts.d;
  }

  // Parse time - try from timeStr first, then dateStr (might contain time), then combinedText
  let h = 12, min = 0; // default midday if unknown
  const timeParts = parseTime(timeStr) || parseTime(dateStr) || parseTime(combinedText);
  if (timeParts) {
    h = timeParts.h; min = timeParts.min;
  } else if (/before\s+(\d{1,2})\s*pm/i.test(timeStr) || /before\s+(\d{1,2})\s*pm/i.test(combinedText)) {
    const match = timeStr.match(/before\s+(\d{1,2})\s*pm/i) || combinedText.match(/before\s+(\d{1,2})\s*pm/i);
    if (match) {
      const n = parseInt(match[1], 10);
      h = (n % 12) + 12; min = 0;
    }
  } else if (/before\s+(\d{1,2})\s*am/i.test(timeStr) || /before\s+(\d{1,2})\s*am/i.test(combinedText)) {
    const match = timeStr.match(/before\s+(\d{1,2})\s*am/i) || combinedText.match(/before\s+(\d{1,2})\s*am/i);
    if (match) {
      const n = parseInt(match[1], 10);
      h = (n % 12); min = 0;
    }
  }

  try {
    // Create date interpreting the input as IST (UTC+5:30)
    // If customer says "8pm IST" (20:00 IST), we need to store it as 14:30 UTC
    // So we create a UTC date by subtracting 5:30 from the IST time
    const istOffsetMs = (5 * 60 + 30) * 60 * 1000; // 5:30 hours in milliseconds
    
    // Create date as if h:min is in IST, then convert to UTC
    // Create UTC date for the given year/month/day/hour/minute
    // Then subtract IST offset to get the UTC equivalent
    const utcTime = Date.UTC(y, m, d, h, min, 0, 0);
    const dt = new Date(utcTime - istOffsetMs);
    
    if (isNaN(dt.getTime())) return undefined;
    
    // Ensure the date is not in the past (unless explicitly specified with a past date)
    if (dt < today && !dateParts && !dateStr.match(/\d{1,2}(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)) {
      // If relative date parsing failed and we got a past date, return undefined
      return undefined;
    }
    return dt;
  } catch {
    return undefined;
  }
}



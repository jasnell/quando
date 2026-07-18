const WEEKDAY_NAMES: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

// Format a date string (ISO date or weekday name) for display
export function formatDate(dateOrDay: string, timezone: string): string {
  // Weekly mode: date is a weekday name like "monday"
  if (WEEKDAY_NAMES[dateOrDay]) {
    return WEEKDAY_NAMES[dateOrDay]!;
  }
  // Specific mode: date is ISO like "2026-07-21"
  const date = new Date(dateOrDay + "T12:00:00Z"); // noon UTC to avoid date shift
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
}

// Format a time string (HH:MM) for display
export function formatTime(time: string, timezone: string): string {
  // time is already in the poll's timezone, just format for display
  const [hours, minutes] = time.split(":").map(Number);
  if (hours === undefined || minutes === undefined) return time;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}

// Add minutes to a "HH:MM" time string, return new "HH:MM"
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined) return time;
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
}

// Format a slot for column header display
export function formatSlotHeader(
  date: string,
  startTime: string | null,
  timezone: string,
  duration?: number | null
): string {
  const dateStr = formatDate(date, timezone);
  if (!startTime) return dateStr;
  const startStr = formatTime(startTime, timezone);
  if (!duration) return `${dateStr} ${startStr}`;
  const endTime = addMinutes(startTime, duration);
  const endStr = formatTime(endTime, timezone);
  return `${dateStr} ${startStr}\u2013${endStr}`;
}

// Check if a poll's latest slot is in the past
// Weekly polls never expire by date — they must be closed manually
export function isPollExpired(
  slots: { date: string; start_time: string | null }[],
  timezone: string,
  duration: number | null,
  scheduleMode: "specific" | "weekly" = "specific"
): boolean {
  if (scheduleMode === "weekly") return false;
  if (slots.length === 0) return true;

  // Find the latest slot end time
  let latestMs = 0;
  for (const slot of slots) {
    // Build a Date in the poll's timezone
    // For date-only polls, the slot expires at end of day
    const timeStr = slot.start_time ?? "23:59";
    const dtString = `${slot.date}T${timeStr}:00`;

    // Use Intl to figure out the UTC equivalent of this wall-clock time in the poll's timezone
    // Construct a formatter that gives us the offset
    const local = new Date(dtString);
    const utcGuess = local.getTime();

    // Get the offset by formatting in the target timezone and parsing back
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(local);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    const tzDate = new Date(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`
    );
    const offset = tzDate.getTime() - utcGuess;
    const utcMs = utcGuess - offset;

    // Add duration if applicable
    const endMs = utcMs + (duration ?? 0) * 60_000;
    if (endMs > latestMs) latestMs = endMs;
  }

  return Date.now() > latestMs;
}

// Generate a CSRF token
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Escape HTML to prevent XSS
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

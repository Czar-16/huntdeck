export const DEFAULT_GOAL = 10;
export const STORAGE_KEYS = ["applications", "dailyGoal", "settings"];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function localDate(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validGoal(value) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 999
  );
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

// A stable UUID for recoverable records; reading storage never changes their identity.
function repairedId(timestamp, index) {
  const hex = BigInt(timestamp).toString(16).padStart(16, "0").slice(-16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8000-${index.toString(16).padStart(12, "0")}`;
}

export function normalize(raw = {}) {
  const warnings = [];
  let historyUnreadable = false;
  let repaired = 0;
  const applications = [];
  const ids = new Set();
  const reservedIds = new Set(
    Array.isArray(raw.applications)
      ? raw.applications
          .map((record) => record?.id)
          .filter((id) => typeof id === "string" && UUID.test(id))
      : [],
  );
  if (raw.applications !== undefined && !Array.isArray(raw.applications)) {
    warnings.push(
      "Application history is unreadable. It has not been overwritten. Reset history in Settings to start again.",
    );
    historyUnreadable = true;
  } else {
    for (const [index, record] of (raw.applications ?? []).entries()) {
      const timestamp =
        typeof record?.timestamp === "string" && record.timestamp.trim() !== ""
          ? Number.isFinite(Number(record.timestamp))
            ? Number(record.timestamp)
            : Date.parse(record.timestamp)
          : record?.timestamp;
      if (
        !record ||
        typeof timestamp !== "number" ||
        !Number.isSafeInteger(timestamp) ||
        timestamp < 0 ||
        timestamp > 8640000000000000
      ) {
        historyUnreadable = true;
        continue;
      }
      let id = record.id;
      if (typeof id !== "string" || !UUID.test(id) || ids.has(id)) {
        let repairIndex = index;
        do {
          id = repairedId(timestamp, repairIndex);
          repairIndex += raw.applications.length + 1;
        } while (ids.has(id) || reservedIds.has(id));
      }
      const date = validDate(record.date) ? record.date : localDate(timestamp);
      if (
        id !== record.id ||
        timestamp !== record.timestamp ||
        date !== record.date
      )
        repaired++;
      ids.add(id);
      applications.push({ id, timestamp, date });
    }
    if (historyUnreadable)
      warnings.push(
        "Some application records are unreadable. Valid entries are shown and can be exported. History has not been overwritten; reset it in Settings to allow new entries.",
      );
  }
  if (repaired)
    warnings.push(
      `${repaired} application record${repaired === 1 ? " has" : "s have"} recoverable fields. Repairs will be saved with your next change.`,
    );
  let dailyGoal = raw.dailyGoal;
  if (typeof dailyGoal === "string" && /^\d+$/.test(dailyGoal))
    dailyGoal = Number(dailyGoal);
  if (!validGoal(dailyGoal)) {
    if (raw.dailyGoal !== undefined)
      warnings.push(
        "The saved daily goal is invalid. Using 10 until your next change.",
      );
    dailyGoal = DEFAULT_GOAL;
  }
  const settings =
    raw.settings &&
    typeof raw.settings === "object" &&
    !Array.isArray(raw.settings)
      ? { ...raw.settings, version: 1 }
      : { version: 1 };
  return { applications, dailyGoal, settings, warnings, historyUnreadable };
}

export function calendarDays(now = new Date(), count = 7) {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(date);
    day.setDate(day.getDate() - (count - 1 - index));
    return { date: localDate(day), day };
  });
}

export function statistics(applications, now = new Date()) {
  const today = localDate(now);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekKey = localDate(weekStart);
  const monthKey = today.slice(0, 7);
  const grouped = new Map();
  for (const app of applications) {
    const key = localDate(app.timestamp);
    const entries = grouped.get(key) ?? [];
    entries.push(app);
    grouped.set(key, entries);
  }
  const recent = [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 3)
    .map(([date, entries]) => ({
      date,
      count: entries.length,
      latest: [...entries]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 3),
    }));
  return {
    total: applications.length,
    today: grouped.get(today)?.length ?? 0,
    week: applications.filter((app) => {
      const date = localDate(app.timestamp);
      return date >= weekKey && date <= today;
    }).length,
    month: applications.filter((app) => {
      const date = localDate(app.timestamp);
      return date.startsWith(monthKey) && date <= today;
    }).length,
    days: calendarDays(now).map(({ date, day }) => ({
      date,
      day,
      count: grouped.get(date)?.length ?? 0,
    })),
    recent,
  };
}

export function csv(applications) {
  const cell = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ["application_id", "recorded_local_date", "timestamp_iso"],
    ...[...applications]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((app) => [app.id, app.date, new Date(app.timestamp).toISOString()]),
  ];
  return (
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}

export function millisecondsUntilMidnight(now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime() + 50;
}

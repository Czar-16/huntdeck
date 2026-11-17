export const DEFAULT_SETTINGS = {
  appearance: "system",
  streaks: true,
  badge: true,
  heatmap: false,
  notes: false,
  pipeline: false,
  milestones: false,
  csvImport: false,
  accents: false,
  accent: "lime",
  shortcut: false,
};
export const DEFAULT_GOAL = 10;
export const STORAGE_KEYS = [
  "applications",
  "dailyGoal",
  "settings",
  "schemaVersion",
];
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
    value <= 200
  );
}

export function validDate(value) {
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
      "Application history is unreadable. It has not been overwritten. Export readable history and restore a valid backup before editing.",
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
      if (
        ["company", "role", "tag"].some(
          (key) =>
            record[key] !== undefined &&
            (typeof record[key] !== "string" ||
              record[key].length > (key === "tag" ? 80 : 120)),
        ) ||
        (record.pipeline !== undefined &&
          record.pipeline !== "" &&
          !["Applied", "Interview", "Offer", "Rejected"].includes(
            record.pipeline,
          )) ||
        (record.status_changed_at !== undefined &&
          (typeof record.status_changed_at !== "string" ||
            !Number.isFinite(Date.parse(record.status_changed_at))))
      ) {
        historyUnreadable = true;
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
        new Date(timestamp).toISOString() !== record.timestamp ||
        date !== record.date
      )
        repaired++;
      ids.add(id);
      applications.push({
        ...record,
        id,
        timestamp: new Date(timestamp).toISOString(),
        date,
      });
    }
    if (historyUnreadable)
      warnings.push(
        "Some application records are unreadable. Valid entries are shown and can be exported. History has not been overwritten; restore valid storage before editing.",
      );
  }
  if (repaired)
    warnings.push(
      `${repaired} application record${repaired === 1 ? " has" : "s have"} recoverable fields. Repairs will be saved with your next change.`,
    );
  let dailyGoal = raw.dailyGoal;
  if (typeof dailyGoal === "string" && /^\d+$/.test(dailyGoal))
    dailyGoal = Number(dailyGoal);
  if (!(Number.isInteger(dailyGoal) && dailyGoal >= 1 && dailyGoal <= 999)) {
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
      ? { ...DEFAULT_SETTINGS, ...raw.settings }
      : { ...DEFAULT_SETTINGS };
  settings.earnedMilestones = [
    ...new Set([
      ...(Array.isArray(settings.earnedMilestones)
        ? settings.earnedMilestones.filter((n) =>
            [10, 50, 100, 250].includes(n),
          )
        : []),
      ...[10, 50, 100, 250].filter((n) => applications.length >= n),
    ]),
  ];
  return {
    applications,
    dailyGoal,
    settings,
    schemaVersion: 2,
    warnings,
    historyUnreadable,
    readOnly: raw.schemaVersion > 2,
  };
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
    .slice(0, 5)
    .map(([date, entries]) => ({
      date,
      count: entries.length,
      latest: [...entries]
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
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
    CSV_COLUMNS,
    ...[...applications]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((app) => [
        app.id,
        app.date,
        new Date(app.timestamp).toISOString(),
        app.company || "",
        app.role || "",
        app.tag || "",
        app.pipeline || "",
        app.status_changed_at || "",
      ]),
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

export function streak(applications, now = new Date()) {
  const active = new Set(applications.map((app) => localDate(app.timestamp)));
  if (!active.size) return 0;
  const earliest = [...active].sort()[0];
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!active.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  const rests = new Set();
  while (localDate(cursor) >= earliest) {
    const key = localDate(cursor);
    const monday = new Date(cursor);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const week = localDate(monday);
    if (active.has(key)) count++;
    else if (rests.has(week)) break;
    else rests.add(week);
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function heatmap(applications, now = new Date()) {
  const today = localDate(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 6 - ((end.getDay() + 6) % 7));
  const counts = new Map();
  for (const app of applications) {
    const date = localDate(app.timestamp);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return calendarDays(end, 35).map(({ date }) => {
    const future = date > today;
    const count = future ? 0 : (counts.get(date) ?? 0);
    return {
      date,
      count,
      future,
      level: count === 0 ? 0 : count === 1 ? 1 : count < 5 ? 2 : 3,
    };
  });
}

export const CSV_COLUMNS = [
  "application_id",
  "recorded_local_date",
  "timestamp_iso",
  "company",
  "role",
  "tag",
  "pipeline",
  "status_changed_at",
];
export function parseCSV(source) {
  if (typeof source !== "string" || source.length > 5_000_000)
    throw new Error("CSV must be text under 5 MB.");
  const text = source.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false,
    line = 1,
    rowLine = 1;
  const fail = (message) => {
    throw new Error(`Row ${rowLine}: ${message}`);
  };
  const endField = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const endRow = () => {
    endField();
    rows.push({ cells: row, line: rowLine });
    row = [];
    rowLine = line + 1;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += char;
        if (char === "\n") line++;
      }
    } else if (char === ",") endField();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
    } else if (char === '"') {
      if (field || closed) fail("Unexpected quote.");
      quoted = true;
    } else {
      if (closed) fail("Text after closing quote.");
      field += char;
    }
  }
  if (quoted) fail("Unclosed quoted field.");
  if (field || row.length || closed) endRow();
  const header = rows.shift()?.cells;
  if (
    !header ||
    ![3, 8].includes(header.length) ||
    header.some((cell, i) => cell !== CSV_COLUMNS[i])
  )
    throw new Error(
      "Row 1: Expected original three-column or extended eight-column Huntdeck header.",
    );
  const entries = rows.map(({ cells, line }) => {
    const error = (message) => {
      throw new Error(`Row ${line}: ${message}`);
    };
    if (cells.length !== header.length) error("Incorrect number of fields.");
    const [
      id,
      date,
      timestamp,
      company = "",
      role = "",
      tag = "",
      pipeline = "",
      status_changed_at = "",
    ] = cells;
    if (!UUID.test(id)) error("Invalid application UUID.");
    if (!validDate(date)) error("Invalid recording date.");
    if (
      !/^\d{4}-\d\d-\d\dT/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)) ||
      Date.parse(timestamp) < 0
    )
      error("Invalid ISO timestamp.");
    if (company.length > 120 || role.length > 120 || tag.length > 80)
      error("Note exceeds character limit.");
    if (
      pipeline &&
      !["Applied", "Interview", "Offer", "Rejected"].includes(pipeline)
    )
      error("Invalid pipeline status.");
    if (
      status_changed_at &&
      (!/^\d{4}-\d\d-\d\dT/.test(status_changed_at) ||
        !Number.isFinite(Date.parse(status_changed_at)))
    )
      error("Invalid status timestamp.");
    if (pipeline && !status_changed_at)
      error("Pipeline requires a status timestamp.");
    return {
      id,
      date,
      timestamp: new Date(timestamp).toISOString(),
      company,
      role,
      tag,
      pipeline,
      ...(status_changed_at
        ? { status_changed_at: new Date(status_changed_at).toISOString() }
        : {}),
    };
  });
  return entries;
}
export function previewImport(source, applications) {
  const incoming = parseCSV(source);
  const ids = new Set(applications.map((app) => app.id));
  const additions = [];
  let duplicates = 0;
  for (const entry of incoming) {
    if (ids.has(entry.id)) duplicates++;
    else {
      ids.add(entry.id);
      additions.push(entry);
    }
  }
  return { additions, duplicates };
}

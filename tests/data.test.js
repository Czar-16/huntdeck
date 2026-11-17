import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  normalize,
  localDate,
  statistics,
  calendarDays,
  csv,
  validGoal,
  millisecondsUntilMidnight,
} from "../lib/data.js";

process.env.TZ = "America/New_York";
const make = (date, index = 0) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  timestamp: new Date(date).toISOString(),
  date: localDate(new Date(date)),
});

test("empty defaults and goal boundaries", () => {
  assert.deepEqual(normalize({}).applications, []);
  assert.equal(normalize({}).dailyGoal, 10);
  assert.deepEqual(normalize({}).warnings, []);
  for (const goal of [1, 10, 200]) assert.ok(validGoal(goal));
  for (const goal of [0, -1, 201, 1000, 1.5, NaN, Infinity, "10", null])
    assert.equal(validGoal(goal), false);
  assert.equal(normalize({ dailyGoal: "17" }).dailyGoal, 17);
  assert.equal(normalize({ dailyGoal: 0 }).dailyGoal, 10);
  assert.ok(normalize({ dailyGoal: 0 }).warnings.length);
});

test("normalization preserves valid entries and recording-local dates", () => {
  const record = { ...make("2026-11-17T10:00:00Z"), date: "2026-11-18" };
  const state = normalize({
    applications: [record],
    dailyGoal: 5,
    settings: { theme: "dark" },
  });
  assert.deepEqual(state.applications, [record]);
  assert.equal(state.settings.theme, "dark");
  assert.equal(state.settings.appearance, "system");
  assert.deepEqual(state.warnings, []);
});

test("repair recoverable timestamps, dates, missing IDs and duplicate IDs deterministically", () => {
  const record = make("2026-11-17T10:00:00Z");
  const input = {
    applications: [
      record,
      {
        ...record,
        timestamp: String(Date.parse(record.timestamp)),
        date: "2026-02-30",
      },
      { timestamp: "2026-11-17T10:00:00Z" },
    ],
  };
  const state = normalize(input);
  assert.equal(state.applications.length, 3);
  assert.equal(new Set(state.applications.map((app) => app.id)).size, 3);
  assert.equal(state.historyUnreadable, false);
  assert.equal(state.applications[1].date, "2026-11-17");
  assert.deepEqual(normalize(input).applications, state.applications);
  assert.ok(state.warnings[0].includes("2 application records"));
});

test("unreadable history is reported while valid entries survive", () => {
  const record = make("2026-11-17T10:00:00Z");
  for (const applications of [
    "bad",
    null,
    {},
    [record, null, { timestamp: "bad" }, { timestamp: "" }, { timestamp: -1 }],
  ]) {
    const state = normalize({ applications });
    assert.equal(state.historyUnreadable, true);
    assert.ok(state.warnings.length);
    assert.deepEqual(
      state.applications,
      Array.isArray(applications) ? [record] : [],
    );
  }
});

test("Monday weeks, month and year boundaries, current-local grouping, recent times", () => {
  const apps = [
    "2026-11-01T12:00:00",
    "2026-11-15T23:59:59",
    "2026-11-16T00:00:00",
    "2026-11-17T01:00:00",
    "2026-11-17T02:00:00",
    "2026-11-17T03:00:00",
    "2026-11-17T04:00:00",
  ].map((d, i) => make(d, i));
  const stats = statistics(apps, new Date("2026-11-17T12:00:00"));
  assert.equal(stats.total, 7);
  assert.equal(stats.today, 4);
  assert.equal(stats.week, 5);
  assert.equal(stats.month, 7);
  assert.equal(stats.recent.length, 4);
  assert.equal(stats.recent[0].latest.length, 3);
  assert.equal(stats.recent[0].latest[0].timestamp, apps.at(-1).timestamp);
  assert.equal(statistics(apps, new Date("2026-11-15T23:59:59")).week, 1);
  const years = [make("2025-12-31T23:59:59"), make("2026-01-01T00:00:00", 1)];
  assert.equal(statistics(years, new Date("2026-01-01T12:00:00")).month, 1);
  assert.equal(statistics(years, new Date("2026-01-01T12:00:00")).week, 2);
});

test("seven calendar dates across DST and leap days; midnight uses local calendar", () => {
  assert.deepEqual(
    calendarDays(new Date("2026-03-09T00:05:00")).map((d) => d.date),
    [
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ],
  );
  assert.deepEqual(
    calendarDays(new Date("2026-11-02T00:05:00")).map((d) => d.date),
    [
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ],
  );
  assert.ok(
    calendarDays(new Date("2024-03-01T12:00:00")).some(
      (d) => d.date === "2024-02-29",
    ),
  );
  assert.equal(
    millisecondsUntilMidnight(new Date("2026-03-08T00:00:00")),
    23 * 3600000 + 50,
  );
  assert.equal(
    millisecondsUntilMidnight(new Date("2026-11-01T00:00:00")),
    25 * 3600000 + 50,
  );
});

test("changing timezone changes displayed dates, preserves export date", () => {
  const modulePath = new URL("../lib/data.js", import.meta.url).href;
  const source = `import { normalize, statistics } from ${JSON.stringify(modulePath)}; const state=normalize({applications:[{id:'00000000-0000-4000-8000-000000000000',timestamp:Date.parse('2026-11-17T01:00:00Z'),date:'2026-11-17'}]}); console.log(JSON.stringify([statistics(state.applications,new Date('2026-11-17T12:00:00Z')).today,state.applications[0].date]));`;
  const run = (TZ) =>
    JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", source], {
        env: { ...process.env, TZ },
        encoding: "utf8",
      }),
    );
  assert.deepEqual(run("Asia/Kolkata"), [1, "2026-11-17"]);
  assert.deepEqual(run("America/Los_Angeles"), [0, "2026-11-17"]);
});

test("CSV exports all records, ISO instants, recording dates, escaped quotes and CRLF", () => {
  const apps = [
    make("2026-11-17T10:00:00Z"),
    {
      id: 'quoted,"id',
      date: "2026-11-16",
      timestamp: Date.parse("2026-11-16T20:00:00Z"),
    },
  ];
  const output = csv(apps);
  assert.ok(
    output.startsWith(
      '\uFEFF"application_id","recorded_local_date","timestamp_iso","company","role","tag","pipeline","status_changed_at"\r\n',
    ),
  );
  assert.ok(
    output.includes(
      '"quoted,""id","2026-11-16","2026-11-16T20:00:00.000Z","","","","",""\r\n',
    ),
  );
  assert.equal(output.split("\r\n").length, 4);
  assert.equal(csv([]).split("\r\n").length, 2);
});

test("repaired IDs cannot collide with a later valid ID", () => {
  const timestamp = 1794910000000;
  const candidate = normalize({ applications: [{ timestamp }] }).applications[0]
    .id;
  const valid = { id: candidate, timestamp, date: "2026-11-17" };
  const state = normalize({ applications: [{ timestamp }, valid] });
  assert.equal(new Set(state.applications.map((app) => app.id)).size, 2);
  assert.deepEqual(state.applications[1], {
    ...valid,
    timestamp: new Date(timestamp).toISOString(),
  });
  assert.deepEqual(
    normalize({ applications: state.applications }).warnings,
    [],
  );
});

test("streaks allow one completed rest day per Monday week and skip unfinished today", async () => {
  const { streak } = await import("../lib/data.js");
  const apps = (dates) => dates.map((date, i) => make(`${date}T12:00:00`, i));
  assert.equal(streak([], new Date("2026-11-17T12:00:00")), 0);
  assert.equal(
    streak(apps(["2026-11-16"]), new Date("2026-11-17T12:00:00")),
    1,
  );
  assert.equal(
    streak(apps(["2026-11-16", "2026-11-18"]), new Date("2026-11-19T12:00:00")),
    2,
  );
  assert.equal(
    streak(apps(["2026-11-16", "2026-11-19"]), new Date("2026-11-20T12:00:00")),
    1,
  );
  assert.equal(
    streak(apps(["2026-11-14", "2026-11-17"]), new Date("2026-11-17T12:00:00")),
    2,
  );
});

test("heatmap spans five Monday weeks and disables future calendar dates", async () => {
  const { heatmap } = await import("../lib/data.js");
  const result = heatmap(
    Array.from({ length: 5 }, (_, i) => make("2026-11-17T12:00:00", i)),
    new Date("2026-11-17T12:00:00"),
  );
  assert.equal(result.length, 35);
  assert.equal(result[0].date, "2026-10-19");
  assert.equal(result.at(-1).date, "2026-11-22");
  assert.equal(result.filter((day) => day.future).length, 5);
  assert.equal(result.find((day) => day.date === "2026-11-17").level, 3);
});

test("CSV round trips multiline notes, Unicode, quotes and original exports; rejects malformed rows", async () => {
  const { parseCSV, previewImport } = await import("../lib/data.js");
  const entry = {
    ...make("2026-11-17T12:00:00"),
    company: 'A, "Company"\r\n第二行',
    role: "Developer",
    tag: "remote",
    pipeline: "Interview",
    status_changed_at: "2026-11-18T10:00:00.000Z",
  };
  assert.deepEqual(parseCSV(csv([entry])), [entry]);
  const original =
    "application_id,recorded_local_date,timestamp_iso\r\n" +
    `${entry.id},${entry.date},${entry.timestamp}\r\n`;
  assert.equal(parseCSV(original)[0].id, entry.id);
  assert.deepEqual(previewImport(csv([entry, entry]), []), {
    additions: [entry],
    duplicates: 1,
  });
  assert.deepEqual(previewImport(csv([entry]), [entry]), {
    additions: [],
    duplicates: 1,
  });
  for (const malformed of [
    original.replace(entry.id, "bad"),
    original.replace(entry.date, "2026-02-30"),
    original.replace(entry.timestamp, "bad"),
    csv([entry]).replace('"Developer"', '"Developer"bad'),
    original + '"open',
  ])
    assert.throws(() => parseCSV(malformed), /Row \d+:/);
});

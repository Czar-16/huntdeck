import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../lib/store.js";

function fixture(initial = {}) {
  let data = structuredClone(initial);
  let failWrite = false;
  let failRead = false;
  let active = 0;
  let maxActive = 0;
  let writes = 0;
  let counter = 0;
  const storage = {
    async get() {
      active++;
      maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      if (failRead) throw new Error("Read failed");
      return structuredClone(data);
    },
    async set(value) {
      active++;
      maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      if (failWrite) {
        failWrite = false;
        throw new Error("Quota exceeded");
      }
      data = structuredClone(value);
      writes++;
    },
  };
  const dispatch = createStore(storage, {
    now: () => 1794910000000 + counter,
    uuid: () =>
      `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  });
  return {
    dispatch,
    data: () => data,
    writes: () => writes,
    maxActive: () => maxActive,
    failWrite: () => {
      failWrite = true;
    },
    failRead: (value) => {
      failRead = value;
    },
  };
}

test("migrates defaults once; operations persist the four schema keys", async () => {
  const f = fixture();
  const initial = await f.dispatch({ type: "getState" });
  assert.equal(initial.dailyGoal, 10);
  assert.equal(f.writes(), 1);
  const saved = await f.dispatch({ type: "addApplication" });
  assert.equal(saved.applications.length, 1);
  assert.equal(
    saved.applications[0].timestamp,
    new Date(1794910000000).toISOString(),
  );
  assert.match(saved.applications[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(f.data()).sort(), [
    "applications",
    "dailyGoal",
    "schemaVersion",
    "settings",
  ]);
});

test("overlapping adds and reads are serialized without lost updates", async () => {
  const f = fixture();
  const operations = Array.from({ length: 30 }, () =>
    f.dispatch({ type: "addApplication" }),
  );
  const read = f.dispatch({ type: "getState" });
  const results = await Promise.all(operations);
  assert.deepEqual(
    results.map((s) => s.applications.length),
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
  assert.equal((await read).applications.length, 30);
  assert.equal(new Set(f.data().applications.map((a) => a.id)).size, 30);
  assert.equal(f.maxActive(), 1);
});

test("failed writes do not update history; queued operations continue after failures", async () => {
  const f = fixture();
  f.failWrite();
  const first = f.dispatch({ type: "addApplication" });
  const second = f.dispatch({ type: "addApplication" });
  await assert.rejects(first, /not saved/);
  assert.equal((await second).applications.length, 1);
  assert.equal(f.data().applications.length, 1);
  f.failRead(true);
  await assert.rejects(f.dispatch({ type: "getState" }), /Could not read/);
  f.failRead(false);
  assert.equal((await f.dispatch({ type: "getState" })).applications.length, 1);
});

test("undo removes newest timestamp, breaking ties by most recently stored entry", async () => {
  const f = fixture();
  await Promise.all(
    [1, 2, 3].map(() => f.dispatch({ type: "addApplication" })),
  );
  let state = await f.dispatch({ type: "undoLatest" });
  assert.equal(state.applications.length, 2);
  assert.ok(state.applications.at(-1).id.endsWith("002"));
  await f.dispatch({ type: "undoLatest" });
  await f.dispatch({ type: "undoLatest" });
  state = await f.dispatch({ type: "undoLatest" });
  assert.equal(state.applications.length, 0);
  const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  const shuffled = fixture({
    applications: [3, 2, 2, 1].map((n, i) => ({
      id: id(i),
      timestamp: n,
      date: "1970-01-01",
    })),
  });
  state = await shuffled.dispatch({ type: "undoLatest" });
  assert.deepEqual(
    state.applications.map((a) => Date.parse(a.timestamp)),
    [2, 2, 1],
  );
  state = await shuffled.dispatch({ type: "undoLatest" });
  assert.deepEqual(
    state.applications.map((a) => a.id),
    [id(1), id(3)],
  );
});

test("goal persists, reset preserves it and settings, history survives store recreation", async () => {
  const f = fixture({ settings: { custom: true } });
  await f.dispatch({ type: "updateGoal", goal: 37 });
  await f.dispatch({ type: "addApplication" });
  const reopened = fixture(f.data());
  assert.equal(
    (await reopened.dispatch({ type: "getState" })).applications.length,
    1,
  );
  const state = await f.dispatch({ type: "resetHistory" });
  assert.equal(state.applications.length, 0);
  assert.equal(state.dailyGoal, 37);
  assert.equal(state.settings.custom, true);
});

test("malformed requests and invalid goals are rejected without storage writes", async () => {
  const f = fixture();
  for (const message of [
    null,
    [],
    {},
    "addApplication",
    { type: "bad" },
    { type: "addApplication", payload: 1 },
    { type: "updateGoal" },
    ...[0, 1000, 1.2, "10", null].map((goal) => ({ type: "updateGoal", goal })),
  ]) {
    await assert.rejects(f.dispatch(message));
  }
  assert.equal(f.writes(), 0);
  assert.equal(
    (await f.dispatch({ type: "addApplication" })).applications.length,
    1,
  );
});

test("corrupt history cannot be silently overwritten, including by reset", async () => {
  for (const applications of ["bad", [{ timestamp: "bad" }]]) {
    const f = fixture({ applications, dailyGoal: 20 });
    const state = await f.dispatch({ type: "getState" });
    assert.equal(state.historyUnreadable, true);
    assert.deepEqual(f.data().applications, applications);
    for (const type of ["addApplication", "undoLatest", "updateGoal"])
      await assert.rejects(
        f.dispatch({ type, ...(type === "updateGoal" ? { goal: 10 } : {}) }),
        /unreadable/,
      );
    assert.equal(f.writes(), 0);
    await assert.rejects(f.dispatch({ type: "resetHistory" }), /unreadable/);
    assert.deepEqual(f.data().applications, applications);
  }
});

test("migration preserves IDs, order, recording dates, unknown fields and legacy goal atomically and idempotently", async () => {
  const applications = [2, 1].map((n) => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    timestamp: 1794910000000 + n,
    date: "2026-11-18",
    extra: { keep: true },
  }));
  const f = fixture({
    applications,
    dailyGoal: 999,
    settings: { custom: true },
  });
  const state = await f.dispatch({ type: "getState" });
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.dailyGoal, 999);
  assert.equal(f.writes(), 1);
  assert.deepEqual(
    state.applications,
    applications.map((app) => ({
      ...app,
      timestamp: new Date(app.timestamp).toISOString(),
    })),
  );
  await f.dispatch({ type: "getState" });
  assert.equal(f.writes(), 1);
  await f.dispatch({ type: "addApplication" });
  assert.equal(f.data().dailyGoal, 999);
  await assert.rejects(f.dispatch({ type: "updateGoal", goal: 201 }));
  await f.dispatch({ type: "updateGoal", goal: 200 });
  assert.equal(f.data().dailyGoal, 200);
});

test("failed migration leaves bytes untouched and Retry succeeds; future schemas remain read-only", async () => {
  const raw = { applications: [{ timestamp: 1794910000000 }], dailyGoal: 250 };
  const f = fixture(raw);
  f.failWrite();
  const failed = await f.dispatch({ type: "getState" });
  assert.equal(failed.migrationFailed, true);
  assert.deepEqual(f.data(), raw);
  const retried = await f.dispatch({ type: "retryMigration" });
  assert.equal(retried.migrationFailed, undefined);
  assert.equal(f.data().schemaVersion, 2);
  const future = fixture({ schemaVersion: 3, applications: [], settings: {} });
  assert.equal((await future.dispatch({ type: "getState" })).readOnly, true);
  await assert.rejects(future.dispatch({ type: "resetHistory" }), /read-only/);
  assert.equal(future.writes(), 0);
});

test("saved IDs target notes; status timestamps and all disabled feature data survive", async () => {
  const f = fixture();
  await f.dispatch({
    type: "updateSettings",
    settings: { notes: true, pipeline: true },
  });
  const first = await f.dispatch({ type: "addApplication" });
  await f.dispatch({ type: "addApplication" });
  await f.dispatch({
    type: "updateNote",
    id: first.savedId,
    note: { company: "<script>plain</script>", role: "Dev", tag: "remote" },
  });
  assert.equal(f.data().applications[0].pipeline, "Applied");
  const state = await f.dispatch({
    type: "updateStatus",
    id: first.savedId,
    status: "Offer",
  });
  assert.equal(state.applications[0].pipeline, "Offer");
  assert.match(state.applications[0].status_changed_at, /Z$/);
  await assert.rejects(
    f.dispatch({
      type: "updateNote",
      id: first.savedId,
      note: { company: "x".repeat(121), role: "", tag: "" },
    }),
  );
  await f.dispatch({
    type: "updateSettings",
    settings: { notes: false, pipeline: false },
  });
  assert.equal(f.data().applications[0].company, "<script>plain</script>");
  await assert.rejects(
    f.dispatch({ type: "updateStatus", id: first.savedId, status: "Rejected" }),
    /disabled/,
  );
});

test("milestone receipts survive reset; imported achievements never replay", async () => {
  const { csv } = await import("../lib/data.js");
  const f = fixture();
  await f.dispatch({
    type: "updateSettings",
    settings: { milestones: true, csvImport: true },
  });
  let state;
  for (let n = 0; n < 10; n++)
    state = await f.dispatch({ type: "addApplication" });
  assert.equal(state.milestone, 10);
  const backup = csv(state.applications);
  await f.dispatch({ type: "resetHistory" });
  assert.deepEqual(f.data().settings.earnedMilestones, [10]);
  const imported = await f.dispatch({ type: "confirmImport", csv: backup });
  assert.equal(imported.milestone, undefined);
  const next = await f.dispatch({ type: "addApplication" });
  assert.equal(next.milestone, undefined);
});

test("import preview never writes and confirmation deduplicates against current storage", async () => {
  const { csv } = await import("../lib/data.js");
  const f = fixture();
  await f.dispatch({ type: "updateSettings", settings: { csvImport: true } });
  const entry = (await f.dispatch({ type: "addApplication" })).applications[0];
  await f.dispatch({ type: "resetHistory" });
  const text = csv([entry, entry]);
  const before = f.writes();
  const preview = await f.dispatch({ type: "previewImport", csv: text });
  assert.deepEqual(preview.importPreview, { additions: 1, duplicates: 1 });
  assert.equal(f.writes(), before);
  await f.dispatch({ type: "confirmImport", csv: text });
  await f.dispatch({ type: "confirmImport", csv: text });
  assert.equal(f.data().applications.length, 1);
});

test("shortcut is opt-in and repeated commands share serialized repeat protection", async () => {
  const f = fixture();
  assert.equal(
    (await f.dispatch({ type: "shortcutLog" })).applications.length,
    0,
  );
  await f.dispatch({ type: "updateSettings", settings: { shortcut: true } });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => f.dispatch({ type: "shortcutLog" })),
  );
  assert.deepEqual(
    results.map((s) => s.applications.length),
    [1, 1, 1, 1, 1],
  );
});

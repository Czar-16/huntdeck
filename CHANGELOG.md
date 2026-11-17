# Changelog

## 1.1.0 — 2026-11-17

- Redesign the popup with bundled fonts, rounded cards, daily goal ring, four statistics, and compact chart/activity.
- Add System/Light/Dark appearance, goal steppers, accessible controls, and typed reset confirmation.
- Migrate history atomically to schema v2 with ISO timestamps, preservation of legacy data, retry/export recovery, and future-schema read-only protection.
- Add optional streaks, daily toolbar badge, five-week heatmap, quick notes, editable paginated History, pipeline, milestones, CSV import, accent colors, and logging shortcut.
- Extend CSV exports while accepting original backups; retain local UUID matches during imports.
- Keep permissions limited to storage. Notifications, weekly summaries, and holiday pauses remain deferred.

## 1.0.0

- Initial local-only application counter, goals, chart, history export, and serialized storage.

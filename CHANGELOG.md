# Changelog

## 1.1.1 — 2026-11-17

- Provide separate Firefox 142+ and Chrome upload packages with shared Promise-based extension API access; declare no data collection for Firefox.
- Set Alt+H to open Huntdeck and Alt+J to log by default on both browsers. Existing user assignments remain controlled by the browser.
- Soften AMOLED red to #FF3333 and green to #4DFF4D.

- Keep Apply independent of optional notes, preserving the original draft through additional clicks and failed saves. Move notes below dashboard content.
- Require Company and Role (120 characters each) for notes; remove Tag inputs while preserving legacy tags and the CSV tag column.
- Show complete notes as compact expandable History summaries, filter before batches of 50, and preserve expansion and unsaved edits across refreshes.
- Put the Settings heading and daily goal first with aligned goal controls.
- Move appearance and Lime/Aqua/Amber accents to a keyboard-accessible homepage palette. Add AMOLED Yellow, Red, and Green with immediate persistence and failed-write rollback.
- Display Chrome’s actual shortcut assignment, link configuration, and handle the assigned combination in the popup outside text fields with shared worker repeat protection.
- Retain schema version 2, existing defaults and history, and storage-only permissions.

## 1.1.0 — 2026-11-17

- Redesign the popup with bundled fonts, rounded cards, daily goal ring, four statistics, and compact chart/activity.
- Add System/Light/Dark appearance, goal steppers, accessible controls, and typed reset confirmation.
- Migrate history atomically to schema v2 with ISO timestamps, preservation of legacy data, retry/export recovery, and future-schema read-only protection.
- Add optional streaks, daily toolbar badge, five-week heatmap, quick notes, editable paginated History, pipeline, milestones, CSV import, accent colors, and logging shortcut.
- Extend CSV exports while accepting original backups; retain local UUID matches during imports.
- Keep permissions limited to storage. Notifications, weekly summaries, and holiday pauses remain deferred.

## 1.0.0

- Initial local-only application counter, goals, chart, history export, and serialized storage.

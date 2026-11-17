# Huntdeck

**One click for every application.** A compact, private Chrome extension for keeping your job search moving.

Huntdeck runs entirely on your device. It uses vanilla JavaScript, HTML, CSS, and Manifest V3, with no accounts, analytics, remote services, or runtime dependencies.

## Install in Chrome

1. Clone this repository, or download and extract its ZIP from GitHub.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open Chrome’s Extensions menu and pin **Huntdeck**.

No build or package installation is required. After updating the files, click **Reload** on Huntdeck’s extension card and reopen the popup.

## Use

- Click **+1 Applied** each time you send an application. The counter updates immediately; the success message appears only after Chrome saves it. Failed saves roll the counter back and show an error.
- The button stays disabled while saving and for at least 400 milliseconds from the click, preventing accidental double-clicks.
- **Undo last** immediately removes the entry with the latest timestamp. For equal timestamps, it removes the last stored entry. Empty history disables undo.
- See your lifetime total, today/week/month totals, daily goal progress, seven-day chart, and your last three active dates. Each date shows its total and up to three latest recording times.
- Open **Settings** to change your daily goal (a whole number from 1–999; defaults to 10), export your history, or reset it. The back arrow returns to the dashboard; Escape cancels a pending reset or returns from Settings.
- **Reset history** asks for confirmation and removes every application. Your daily goal stays. **Cancel** or Escape leaves history untouched. Reset cannot be undone.

The popup is 380px wide. Chrome limits popup height; scroll to reach lower content when needed. Buttons and inputs support keyboard navigation and visible focus, and motion respects your system’s reduced-motion preference.

## Dates and counts

All counts are derived from complete application history. Each entry contains a UUID, an epoch-millisecond timestamp, and the local `YYYY-MM-DD` date at recording time.

Displayed statistics group timestamps in your **current system timezone**. Weeks start on Monday; month totals use the current calendar month. The chart covers seven local calendar dates ending today, including dates with zero applications. Calendar calculations account for daylight-saving transitions rather than assuming each day lasts 24 hours. The popup refreshes on storage changes, focus, visibility changes, and local midnight.

Changing timezone can move an entry to a different displayed day. Its original recording-local date remains intact for export. The extension records when you click; it does not inspect websites or automatically detect applications.

## Your data

Huntdeck requests only the **storage** permission. It has no content scripts, host permissions, external resources, or network requests. Application history, daily goal, and settings live in `chrome.storage.local`, under `applications`, `dailyGoal`, and `settings`.

Data belongs to the current Chrome profile and is **not synced or backed up**. Removing the extension or deleting its profile data deletes the history. Export regularly if you want a backup. Storage is subject to Chrome’s local quota; a failed write produces an error without claiming success. Huntdeck does not request unlimited storage.

**Export CSV** creates a local download containing every readable entry, oldest first, with these columns:

| Column                | Meaning                                        |
| --------------------- | ---------------------------------------------- |
| `application_id`      | Unique application UUID                        |
| `recorded_local_date` | Local date at recording time                   |
| `timestamp_iso`       | Exact instant in UTC, as an ISO 8601 timestamp |

The CSV uses quoted, escaped fields, CRLF line endings, and a UTF-8 BOM for spreadsheet compatibility. Empty history exports the header. CSV import is not supported.

Stored data is validated on read. Recoverable fields (such as a missing ID or recording date) are repaired in memory, with a visible notice, then persisted on your next change. Unreadable history is never silently overwritten: readable entries remain visible and exportable, edits are blocked, and Settings offers an explicit reset. A reset of damaged data permanently discards unreadable records as well. A read failure shows an error; reopening or refocusing the popup retries it.

## Development and verification

Requires Node.js 20.11+ for tests. The extension itself needs no Node tooling.

```sh
npm test
```

The built-in Node test runner covers calendar/week/month boundaries, leap days, both daylight-saving transitions, timezone changes, goals, normalization and corrupt data, CSV escaping, undo ordering, failed reads/writes, and serialized overlapping operations.

Optional browser checks use Playwright as a temporary development tool:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

This loads the real extension into an isolated Chromium profile, tests its popup at 380×600, and checks optimistic updates, rapid clicks, failed-write rollback, undo, settings validation, reset cancellation/confirmation, keyboard focus, reduced motion, CSV downloads, multiple open views, corrupt-storage recovery, and persistence after closing the popup and restarting the browser. It checks text contrast, horizontal overflow, uncaught errors, and absence of external HTTP requests. Screenshots are written to the ignored `test-results/` folder. The temporary browser profile is deleted afterward.

Browser verification opens the extension’s real popup document as a tab; the toolbar’s popup placement and OS-specific Chrome rendering can be checked manually after unpacked installation.

Local PNG icons can be regenerated with Python 3’s standard library:

```sh
npm run icons
```

## Project layout

- `manifest.json`, `popup.html`, `popup.css`, `popup.js`: extension definition and interface.
- `background.js`: module service worker and internal message listener.
- `lib/store.js`: validated, serialized reads and mutations with authoritative responses.
- `lib/data.js`: normalization, calendar calculations, statistics, and CSV generation.
- `icons/`, `scripts/generate-icons.py`: bundled icons and their reproducible generator.
- `tests/`: unit and optional browser checks.

Internal messages are `getState`, `addApplication`, `undoLatest`, `updateGoal` (with numeric `goal`), and `resetHistory`. Unknown requests, extra fields, and invalid goals are rejected. Failed operations do not interrupt the worker’s queue. Chrome storage events keep open views consistent.

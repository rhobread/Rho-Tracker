# rho-Tracker

## Shared Instructions

Read `../AGENTS.md` at the Personal Projects workspace root before working here. It supplies standing workspace read access, key/credential privacy, default commit/push behavior, and server deployment boundaries. This file adds only rho-Tracker requirements.

## Purpose And Stack

- A local-first personal tracker for Money, Habits, and To-Do List, with optional Google sign-in and Drive app-data snapshots.
- Display name: `rho-Tracker` / `Rho Tracker`. The historical npm package name `money-tracker` is not the product display name; do not rename persisted identifiers casually.
- JavaScript, React Native, Expo, AsyncStorage, and native Google Sign-In/Drive integration. This is not a browser-hosted banking app or a custom backend service.
- Repository: `https://github.com/rhobread/Rho-Tracker`.

## Structure And Behavior

- The personal-tracker screen owns one shared session for all three sections. Feature hooks such as `useHabits` are adapters over that session, not competing stores/accounts.
- Keep screens, reusable UI, hooks, domain rules, storage, and integration services separated. Preserve injectable storage/auth/Drive/revision boundaries.
- Validate combined data before persistence. Changes in one section must preserve the other sections, including To-Dos.
- Preserve account/device-only separation, local-first saves, sync pauses while editing, and explicit whole-version conflict choices. Do not silently merge competing financial datasets.
- Preserve integer minor-unit money calculations, recurring-entry behavior, and paid-entry reversal/double-counting safeguards.
- Habits can build/avoid behavior and use scheduled weekdays with daily/weekly views. Preserve history on edits and prohibit future-day check-ins. Do not misrepresent an unchecked avoidance day as confirmed failure.
- To-Dos are one-off dated tasks, not recurring reminders/notifications. Support past/future task dates, selected-day/all-task views, overdue unfinished tasks, and real completion timestamps. Editing a title/date must preserve completion status; do not apply Habits' future-check-in rule to task scheduling.
- Treat schema migrations, storage keys, and native application identifiers as persisted/shipped behavior that requires compatibility consideration.

## Commands And Validation

- `npm start`: Expo development server.
- `npm run android` / `npm run ios`: platform-specific development launch; native prerequisites and a configured build may be required.
- `npm test`: Node domain/storage/session tests.
- `npm run format:check`: repository formatting checks.
- `npm run icons:generate`: regenerate branding icons from the source artwork when intentionally changing branding.
- Run tests appropriate to the change. Distinguish unit/UI-preview results from real native device, Google authentication, or Drive-sync verification.

## Privacy And Preview Safety

- Use synthetic money sources, balances, payments, and habit history for tests/public previews. Do not read or publish real personal datasets, account details, receipts, exports, or tokens for a portfolio task.
- Native Google configuration and credentials remain private. Do not display ignored configuration or claim authentication works without an actual authorized native test.
- A browser preview may use real screen components with safe-area/native shims and in-memory demo adapters. Label that setup and any simulated/disconnected cloud state; never present it as a successful native Google login.
- Keep generated builds, machine-local settings, private configuration, and signing material out of public commits. Never inspect key contents.

## Publishing And Distribution

- Commit/push validated requested source changes to this repository under the shared root defaults.
- No VPS destination or app-store release is automatically approved for this native app. Do not upload native source, credentials, or financial datasets to `/var/www/rhobread`.
- Native build/install/distribution needs its documented authorized workflow. The portfolio's screenshots/detail page are a separate deployment, not the running rho-Tracker app.

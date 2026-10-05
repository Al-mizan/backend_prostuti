# Prostuti — KMP Course Project Guide

## 1. What this is (and isn't)

This is a **university Android development course deliverable**: a Kotlin Multiplatform, Android-only build of the Prostuti exam-prep concept, with its backend embedded in the same project as a Ktor server module, and a role-based admin panel inside the Android app itself.

This is a separate, deliberately smaller codebase built to satisfy the course's "KMP only, backend in the app structure" requirement — treat it as its own repo with its own conventions (see `.agent/skills/prostuti-conventions/SKILL.md`).

## 2. Constraints this build is scoped against

- Kotlin Multiplatform, **Android client only**.
- Backend included **inside the app's project structure** (a `server` Gradle module, not a separate service).
- **Role-based admin panel**, built into the app.
- Question bank: **BCS only**.
- **No live/real-time exam** — no multiplayer battle mode.
- Practice mode: exactly **9 fixed subjects** (§4).
- Content entry (question bank + practice questions): **CSV import**, admin-only.
- **Feature-based modular** Gradle structure.
- Priority: **simplicity** over completeness — this has a grading deadline, not a product roadmap.

## 3. Scope: core / stretch / deferred

Trimmed from the original Prostuti feature list to fit a course timeline. Adjust this table first if your rubric requires something listed as deferred.

**Core (needed for submission):**
- Polished UI (Compose, Prostuti's Crimson Red / Bangla-typography design language)
- Mascot / avatar (static assets are enough — no animation pipeline needed)
- BCS question bank browsing, by exam session and subject
- Practice Mode across the 9 fixed subjects
- Exam Mode — solo, timed BCS mock test (not live/multiplayer)
- History: past attempts + wrong answers (derived, not separately stored — see `docs/backend_design.md` §5)
- Per-exam leaderboard (computed from solo `exam_attempts`, not live)
- AI explanation for MCQs, on demand
- Basic user profile (name, email, avatar choice)
- Role-based admin panel: CSV import for both question types, question review/CRUD, user role management
- Lightweight gamification: streak counter / XP — not a full economy

**Stretch (only if core is done early):**
- Important-question bookmarking
- Offline download of a practice set (Room cache, already scaffolded in `core/database`)
- Friend requests / rank comparison

**Deferred (explicitly out of scope for this build):**
- Live/battle mode with real-time competitors
- Bank/Government/NTRCA exam types
- Job circular notifications
- Ad-based monetization / subscription-alternative system
- A general-purpose "Prostuti AI" conversational assistant (only the scoped explanation endpoint is in)

## 4. Practice subjects (fixed)

Bengali, English, Bangladesh & International Affairs, Geography, Science, IT, Math, Mental Ability, Ethics.

This list is a closed set — see SKILL.md §4 for the enum. Don't let a feature imply it's editable.

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Shared models | Kotlin Multiplatform (`core/model`, androidTarget + jvm) | the actual multiplatform boundary — see `docs/backend_design.md` §2 |
| Android UI | Jetpack Compose | single target, no need for Compose Multiplatform's cross-platform layer |
| State mgmt | ViewModel + StateFlow, MVVM + feature-first | same principle already established for the Flutter build, applied in Kotlin terms |
| DI | Koin | lightweight, works the same in `androidApp` and can be used in `server` too |
| Client networking | Ktor Client | same library family as the server — reinforces "Kotlin only" |
| Offline cache | Room (`core/database`, Android-only) | Android-side cache; not shared with server, no multiplatform DB needed |
| Backend | Ktor server (JVM target) | Kotlin-native HTTP framework, pairs naturally with Ktor client |
| Backend DB | PostgreSQL + Exposed | Kotlin-native SQL layer, avoids a heavier ORM |
| Auth | JWT (`ktor-server-auth-jwt`) with a `role` claim | simple, stateless, sufficient at this scale |
| CSV parsing | Apache Commons CSV (or equivalent) | question text contains commas — don't hand-roll a parser |

Full rationale and trade-offs: `docs/backend_design.md`.

## 6. Module map (short form)

```
core/model (shared)  core/network  core/database  core/designsystem  core/common
feature/{auth, questionbank, practice, exam, history, profile, admin}
androidApp
server
```

Full structure, per-module targets, and the reasoning for what is/isn't multiplatform: `docs/backend_design.md` §4, and the "no ceremony" rule in `SKILL.md` §1.

## 7. Suggested build order

Ordered so each phase produces something demoable, and later phases never block on unbuilt earlier ones.

1. **Scaffold** — multi-module Gradle setup, empty modules compiling, `core/model` with both targets wired up as a sanity check that the KMP mechanism actually works.
2. **Auth + roles, end to end** — register/login, JWT issuance, role gate on one protected route. Thin vertical slice proving the whole stack (Compose → Ktor client → Ktor server → Postgres) works before building on top of it.
3. **Admin CSV import + question bank browsing** — content has to exist before anything else is testable, so build the content pipeline next.
4. **Practice Mode** — fetch questions → answer → score. The core student-facing loop.
5. **Exam Mode + History** — solo timed mock test, then attempts/wrong-answers views (both largely reuse practice-mode plumbing).
6. **Leaderboard + AI explanation + polish** — mascot, gamification basics, design pass.
7. **Stretch, if time remains** — offline download, bookmarking, friend/rank comparison.

## 8. Local setup

**Prerequisites:** recent JDK, Android Studio.

1. Start Postgres locally (no Docker), set `DB_URL` / `DB_USER` / `DB_PASSWORD` env vars for the `server` module.
2. Run the `server` module (`./gradlew :server:run`) — it creates schema on startup via Exposed's `SchemaUtils`.
3. Point the Android app at the server: `http://[IP_ADDRESS]`.
4. Run `androidApp` from Android Studio as normal.
5. Log in as an admin (seed one admin user manually or via a one-off script), use the admin CSV import screens with the templates in `docs/backend_design.md` §7 to get sample BCS + practice data in before testing the student-facing flows.

## 9. Where to look for what

- **Code conventions, module layout, naming, what not to build:** `.agent/skills/prostuti-conventions/SKILL.md`
- **Data model, API endpoints, CSV schema, auth design:** `docs/backend_design.md`
- **Scope, priorities, timeline:** this file

## 10. Demo narrative (useful for a grading walkthrough)

Given the build order above, a natural demo is: log in as admin → import a BCS question-bank CSV and a practice CSV live → switch to a student account → take a Practice session in one subject → take a solo Exam Mode mock test → check History for wrong answers → check the leaderboard for that exam session → open an AI explanation on a missed question. That sequence touches every core-scope item in one pass.

## 11. Assumptions made — correct these if wrong

- Compose (not Compose Multiplatform) for UI, since the client is Android-only.
- Admin panel = role-gated screens inside this same Android app, not a separate web admin tool.
- PostgreSQL for the backend; Room for on-device offline caching only and will use neon for remote DB.
- Email + password auth (no phone/OTP) for simplicity.
- CSV upload happens through the Android admin UI's file picker, not a separate CLI.
- The core/stretch/deferred split in §3 is my read of what a course-scale build should prioritize — if your rubric explicitly requires something listed under "deferred," flag it and we'll rescope.
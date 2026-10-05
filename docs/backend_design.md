# Prostuti KMP Course Project — Backend Design

**Status:** Proposed
**Scope:** University Android development course deliverable.

## 1. Context & constraints

This build must:
- Use Kotlin Multiplatform, targeting **Android only** on the client side.
- Include the backend **inside the same project structure** — not a separately deployed/maintained service.
- Include a **role-based admin panel**.
- Cover the **BCS question bank only** (no Bank/Government/NTRCA).
- Have **no live/real-time exam** (no multiplayer battle mode).
- Support practice in exactly **9 fixed subjects** (§4).
- Support **CSV-based content entry** for both the question bank and practice questions.
- Stay **as simple as possible** — this is being built and graded on a course timeline, not run as a production service.

## 2. Why an embedded Ktor server, and what "KMP" is actually doing here

The course requirement is "KMP only, with backend in the app structure." Concretely:

- `core/model` is a genuine Kotlin Multiplatform module with two targets: `androidTarget()` and `jvm("server")`. Both the Android app and the Ktor backend compile against the same commonMain source set for DTOs, enums, and request/response validation.
- Ktor is chosen for the backend specifically because it's Kotlin-native and works as both the HTTP client library (Android side) and the server framework (backend side) — the same library family on both ends, reinforcing the "Kotlin only" constraint literally, not just in spirit.
- No other module needs multiplatform targets. See SKILL.md §1 — this is a deliberate simplicity decision, not an oversight.

## 3. High-level architecture

```
┌───────────────────────────────┐            ┌────────────────────────────────┐
│        androidApp             │            │           server               │
│  feature/* (student + admin)  │   HTTPS    │  routes → services → db        │
│  ViewModel → Repository       ┼───────────▶│  (Ktor + Exposed + PostgreSQL) │
│  core/network (Ktor client)   │◀───────────┤  JWT auth, role check          │
└───────────────┬───────────────┘            └─────────────────┬──────────────┘
                │                                              │
                ▼                                              │
        core/database (Room —                                  │
        offline cache of downloaded                            │
        practice sets / bank pages)                            │
                                                               ▼
                                                         core/model (shared)
                                                    DTOs, enums, validation —
                                                    consumed by both sides
```

## 4. Module & Gradle structure

```
prostuti-kmp/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle/libs.versions.toml
├── core/
│   ├── model/          # KMP: androidTarget() + jvm("server")
│   ├── network/        # Android — Ktor client
│   ├── database/       # Android — Room, offline cache
│   ├── designsystem/   # Android — Compose theme
│   └── common/         # Android — Result<T>, session/token storage
├── feature/
│   ├── auth/  questionbank/  practice/  exam/  history/  profile/  admin/
├── androidApp/
└── server/             # Kotlin/JVM, Ktor
```

`core/model` example (the only module with two targets):

```kotlin
// core/model/build.gradle.kts
kotlin {
    androidTarget()
    jvm("server")
    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
        }
    }
}
```

## 5. Data model

Deliberately denormalized where a join would add complexity without adding value at this scale — noted inline.

### `users`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | text | |
| email | text, unique | |
| password_hash | text | bcrypt |
| role | enum: `STUDENT`, `ADMIN` | |
| created_at | timestamp | |

### `questions`
Single table for both question bank and practice — differentiated by `type`. Avoids two near-identical tables.

| column | type | notes |
|---|---|---|
| id | UUID PK | |
| type | enum: `BANK`, `PRACTICE` | |
| subject | enum (9 values, §_below_) | required for `PRACTICE`; also set for `BANK` questions where known |
| exam_session | text, nullable | e.g. `"45th BCS Preliminary"` — only meaningful for `type = BANK` |
| topic | text, nullable | chapter/topic label |
| question_text | text | |
| option_a / b / c / d | text | |
| correct_option | enum: `A,B,C,D` | |
| explanation | text, nullable | admin-provided, from CSV |
| difficulty | enum, nullable: `EASY, MEDIUM, HARD` | |
| created_by | UUID, FK → users.id | admin who imported it |
| created_at | timestamp | |

### `practice_sessions`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| subject | enum | |
| question_ids | UUID[] or join table `practice_session_questions` | order matters, so keep it as an ordered array or an ordered join table |
| started_at / finished_at | timestamp, nullable | |
| score | int, nullable | filled on finish |

### `exam_attempts`
Solo, timed BCS mock test — **not** live/multiplayer.

| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| exam_session | text | which BCS mock test |
| question_ids | UUID[] | |
| started_at / finished_at | timestamp | |
| time_taken_seconds | int | |
| score | int | |

### `answers`
One shared table for both session types instead of `practice_answers` + `exam_answers`.

| column | type | notes |
|---|---|---|
| id | UUID PK | |
| session_type | enum: `PRACTICE`, `EXAM` | |
| session_id | UUID | FK to whichever table `session_type` points at (app-level, not a DB FK, since it targets two tables) |
| question_id | UUID FK | |
| selected_option | enum: `A,B,C,D` | |
| is_correct | boolean | |
| answered_at | timestamp | |

### Deliberately *not* separate tables

- **Wrong answers (History feature):** derived — `SELECT ... FROM answers JOIN questions WHERE is_correct = false AND answers.session_id IN (user's sessions)`. No `wrong_answer_bookmarks` table needed unless "bookmark an important question" (stretch scope) ships, in which case that's a small separate `bookmarks(user_id, question_id)` table — still not the same thing as "wrong answers."
- **Leaderboard:** derived — rank `exam_attempts` by `(score DESC, time_taken_seconds ASC)` per `exam_session`, computed at query time. At this scale a materialized/cached leaderboard is unnecessary complexity; revisit only if query performance becomes a real problem.

## 6. API surface

All routes under `/api/v1`. `🔒` = requires auth. `🔒A` = requires `Role.ADMIN`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | |
| POST | `/auth/login` | returns JWT with `role` claim |
| GET | `/subjects` | returns the fixed 9-subject list |
| GET | `/question-bank` 🔒 | filter by `examSession`, `subject`, paginated |
| GET | `/practice/questions` 🔒 | filter by `subject`, `topic`, `count` |
| POST | `/practice/sessions` 🔒 | start a session |
| POST | `/practice/sessions/{id}/answers` 🔒 | submit one answer |
| POST | `/practice/sessions/{id}/finish` 🔒 | closes session, computes score |
| POST | `/exam/sessions` 🔒 | start a solo BCS mock test |
| POST | `/exam/sessions/{id}/submit` 🔒 | submit all answers, computes score + time |
| GET | `/history/attempts` 🔒 | past practice + exam sessions |
| GET | `/history/wrong-answers` 🔒 | derived query, see §5 |
| GET | `/leaderboard/{examSession}` 🔒 | derived ranking, see §5 |
| GET | `/admin/questions` 🔒A | list/manage, filterable |
| PUT / DELETE | `/admin/questions/{id}` 🔒A | |
| POST | `/admin/question-bank/import` 🔒A | multipart CSV upload, see §7 |
| POST | `/admin/practice-questions/import` 🔒A | multipart CSV upload, see §7 |
| GET | `/admin/users` 🔒A | manage roles |

## 7. CSV import schema

Two templates. Both use a real CSV parser (Apache Commons CSV or equivalent) — question text will contain commas, so naive splitting is unsafe.

### `question-bank-template.csv`
```
exam_session,subject,topic,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty
"45th BCS Preliminary",BENGALI,"সন্ধি","প্রশ্নের লেখা...","ক","খ","গ","ঘ",A,"ব্যাখ্যা (ঐচ্ছিক)",MEDIUM
```

### `practice-questions-template.csv`
```
subject,topic,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty
MATH,"বীজগণিত","প্রশ্নের লেখা...","ক","খ","গ","ঘ",B,"",EASY
```

**Validation rules (reject the row, don't silently coerce):**
- `subject` must exactly match one of the 9 enum values (§4/§5) — case-sensitive match against the fixed set.
- `correct_option` must be one of `A, B, C, D`.
- `question_text` and all four options are required, non-empty.
- `exam_session` required only in the question-bank template.
- `difficulty` optional; if present, must be `EASY`, `MEDIUM`, or `HARD`.

**Import behavior:** insert-only for this build (no upsert key). Re-uploading a file creates duplicates — acceptable for a course project; flagged as a known limitation in `project_guide.md`, with an optional `external_ref` column as a future idempotency key if it becomes a real problem.

## 8. Auth & role-based access

- JWT (`io.ktor:ktor-server-auth-jwt`), issued at login, carrying `sub` (user id) and `role`.
- Server-side: every non-public route requires a valid JWT; admin routes additionally require `role = ADMIN` via the `adminOnly` interceptor (SKILL.md §6). This check is the actual security boundary.
- Client-side: the Android app stores the token in `core/common`'s session store (Android's `EncryptedSharedPreferences`, or DataStore with the token itself encrypted) and hides admin navigation destinations when `role != ADMIN`. This is UX convenience only — never trust it as the boundary, since it's client-controlled.


## 9. Deferred / explicitly out of scope

Matches SKILL.md §8 — kept here too since this is the document that would otherwise imply schema/endpoints for them:

- Live/real-time battle mode (no websocket layer, no live leaderboard push)
- Bank/Government/NTRCA question types
- Job circular notifications
- Ad-serving / subscription-alternative monetization
- Friend requests / social rank comparison (stretch, not core — see `project_guide.md` §3)

## 10. Local dev & config

- `server/src/main/resources/application.conf` reads `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` from environment variables — never commit real secrets.
- **Database: Neon (managed, serverless Postgres)** rather than local Docker Postgres. Neon is wire-compatible with standard PostgreSQL, so Exposed/HikariCP/JDBC need no code changes — only `DB_URL` changes, to Neon's connection string with `sslmode=require` appended. Use Neon's *direct* connection string, not the `-pooler` one — HikariCP already pools connections, so stacking Neon's own PgBouncer pooler underneath it adds a second pooling layer for no benefit at this scale. This also means the team shares one synced database instead of each running a separate local Postgres — just share the same `DB_URL`, or give each teammate their own Neon branch of the same project for isolated dev data. Note: Neon's free tier suspends its compute after inactivity, so the first query after idle time will be a bit slower while it wakes up — expected, not a bug.
- Android app points at the server via `[IP_ADDRESS]` on the emulator (the standard host-loopback alias) or the machine's LAN IP for a physical device — set in a local, gitignored config, not hardcoded.


## 11. Assumptions made — flag if any of these are wrong

- PostgreSQL (Neon, managed) + Exposed for the backend; Room for the Android-side offline cache only (not shared/multiplatform — see SKILL.md §1).
- Admin panel is implemented as `Role.ADMIN`-gated screens inside the same Android app, not a separate web admin UI — consistent with "Android only" and "in the app."
- Password auth (email + password) rather than phone/OTP — simplest to implement and demo in the course timeframe.
- CSV upload happens through the Android admin screens (file picker → multipart upload), not a separate CLI or web tool.
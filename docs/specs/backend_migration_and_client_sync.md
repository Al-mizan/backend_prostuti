# Specification: Ktor to TypeScript Backend Migration & Client Envelope Synchronization

**Status:** Ready for Implementation  
**Originating Prompt:** User request to extract and transform the embedded Ktor backend from `app/server` into a standalone TypeScript + Express + Prisma backend in `/backend` conforming to `backend/docs/backend.md`, using Passport.js for auth, in-memory `busboy` CSV imports (no Multer/Cloudinary), strictly standardized `{ success, message, data, meta }` response envelopes, and updating the Android client networking layer accordingly.

---

## 1. Problem Statement

1. **Monolithic Backend Coupling:** The existing Ktor backend is embedded as a subproject module inside the Android Gradle tree (`app/server`). This ties backend dependencies and builds to JVM/Gradle tools, preventing standard Node.js deployment, independent scaling, and modern TypeScript ecosystem tooling.
2. **Architectural Blueprint Drift:** The project documentation includes a comprehensive production-grade blueprint ([`backend/docs/backend.md`](file:///home/almizan/Other%20Locations/workspace/Projects/hobby/prostuti/prostuti_app/backend/docs/backend.md)) based on Express.js, TypeScript, and Prisma with strict module layering (controller, service, route, validation, interface, constant). The existing Ktor backend does not adhere to this structure.
3. **Response Envelope Inconsistency:** The Android client currently expects bare, unwrapped domain DTOs (e.g. `{ token, userId, role }` or `List<BcsSessionSummaryDto>`), whereas the standard backend architecture dictates a consistent response envelope `{ success: boolean, message: string, data: T, meta?: TMeta }` and standardized error handling `{ success: false, message: string, errorSources: [...] }`.
4. **Auth & CSV Integration Alignment:** The backend blueprint originally referenced `better-auth` and Cloudinary-backed Multer storage, neither of which matches the required mobile JWT Bearer authentication, local Google OAuth verification, or in-memory CSV file parsing needed for Prostuti's BCS preparation domain.

---

## 2. Proposed Solution & Architecture

### 2.1 Standalone Backend (`/backend`)
- **Runtime & Stack:** Node.js 22+ (ESM), TypeScript ^5.9, Express.js ^5.2, Prisma ^7.x (`@prisma/adapter-pg`).
- **Scope Pruning:** Completely prune Stripe, Socket.IO, and PDFKit dependencies and initialization code to keep the service lean and conform to [`srs.md#L211-L218`](file:///home/almizan/Other%20Locations/workspace/Projects/hobby/prostuti/prostuti_app/backend/docs/srs.md#L211-L218).
- **Caching:** Redis 6+ client with in-memory `Map` fallback (`RedisService`) ensuring full functionality even if Redis is offline during local development.
- **Database Mapping:** Multi-file Prisma schema under `prisma/schema/` mapped directly to existing Neon PostgreSQL tables:
  - `users` (`@@map("users")`, `@map("password_hash")`, `@map("google_id")`, `@map("avatar_id")`, soft delete `is_deleted`)
  - `questions` (`@@map("questions")`, `@map("exam_session")`, `@map("question_text")`, `@map("correct_option")`, etc.)
  - `practice_sessions` & `practice_session_questions`
  - `exam_attempts` & `exam_attempt_questions`
  - `answers`
- **Authentication & RBAC:**
  - `passport` + `passport-jwt` verifying Bearer tokens from `Authorization: Bearer <token>` (or `accessToken` cookie).
  - `passport-google-oauth20` + mobile Google ID token endpoint (`POST /api/v1/auth/google`).
  - Bcrypt password hashing (`cost = 10`) matching existing Ktor `AuthService.kt`.
  - Admin bootstrap endpoint: `POST /api/v1/auth/bootstrap-admin` verified in constant time against `BOOTSTRAP_TOKEN` header (`X-Bootstrap-Token`).
  - Middleware: `checkAuth(Role.ADMIN, ...)` enforcing role constraints server-side.
- **In-Memory Streaming CSV Import:**
  - Dedicated `busboy` streaming multipart parser for `/api/v1/admin/question-bank/import` and `/api/v1/admin/practice-questions/import`.
  - Rows streamed directly into `csv-parse` in memory (zero disk writes, zero Cloudinary calls).
  - Row-by-row Zod validation collecting invalid rows in a `rejected: Array<{ rowNumber: number, reason: string }>` list while valid rows are batch-inserted in chunks of 250 via `prisma.question.createMany`.
  - Returns `ImportSummary` (`{ imported: number, rejected: [...] }`).
- **Core Domain Modules:**
  1. `auth`: Register, Login, Google OAuth, Bootstrap Admin, Me.
  2. `user`: Profile read/update, Admin user listing, Admin role update (with last-admin demotion guard).
  3. `questionBank`: Distinct sessions summary (50th down to 10th BCS with question counts), paginated question browsing.
  4. `practice`: Start session with randomized question selection across the 9 fixed subjects, submit answer with instant feedback, finish session with score computation.
  5. `exam`: Start timed solo mock attempt, batch submit with BCS negative marking (`+1.0` per correct, `-0.5` per incorrect, minimum 0.0), leaderboard ranking by `score DESC, timeTakenSeconds ASC`.
  6. `history`: User attempt history (practice + exam chronologically descending), derived wrong answers query (`answers JOIN questions WHERE is_correct = false`).
  7. `admin`: CSV imports, question CRUD with active session deletion protection.

### 2.2 Client Networking Envelope Synchronization (`app/core`)
- **Model Layer (`app/core/model`):**
  - Add `ApiResponse<T>`:
    ```kotlin
    @Serializable
    data class ApiResponse<T>(
        val success: Boolean,
        val message: String,
        val data: T? = null,
        val meta: MetaDto? = null
    )
    ```
  - Add `MetaDto`:
    ```kotlin
    @Serializable
    data class MetaDto(
        val page: Int,
        val limit: Int,
        val total: Int,
        val totalPages: Int
    )
    ```
- **Network Layer (`app/core/network`):**
  - Update `HttpClientFactory.kt`, `AuthApi.kt`, `ProfileApi.kt`, `QuestionBankApi.kt`, `PracticeApi.kt`, `ExamApi.kt`, `HistoryApi.kt`, and `AdminApi.kt` to unpack `response.data`.
  - Throw clear operational `ApiException(response.message)` when `success == false`.
  - All ViewModels and UseCases across `feature/*` consume existing domain DTOs with zero changes.

---

## 3. Test Seams & Verification Strategy

### Seam 1: Authentication & Authorization Seam
- **Interface:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/bootstrap-admin`, `GET /api/v1/me`.
- **Test Cases:**
  - Register new student -> returns 201 with JWT token and user info inside `{ success: true, data: { token, userId, role: "STUDENT" } }`.
  - Reject duplicate email registration -> returns 400 with `{ success: false, message: "Email already registered" }`.
  - Login with valid credentials -> returns 200 with JWT token.
  - Call protected route (`GET /api/v1/me`) without Bearer token -> returns 401 Unauthorized.
  - Call admin route (`GET /api/v1/admin/users`) with student token -> returns 403 Forbidden.
  - Bootstrap admin with valid `X-Bootstrap-Token` -> returns 200 with admin role.

### Seam 2: CSV Import & Row-Level Validation Seam
- **Interface:** `POST /api/v1/admin/question-bank/import`, `POST /api/v1/admin/practice-questions/import`.
- **Test Cases:**
  - Valid CSV file -> returns 200 with `{ success: true, data: { imported: N, rejected: [] } }`.
  - CSV containing invalid rows (invalid subject, missing question text, bad correct_option) -> valid rows imported, invalid rows reported in `rejected` with row numbers and exact reasons; status 200.
  - Non-admin token -> returns 403 Forbidden.

### Seam 3: Practice & Exam Scoring Seams
- **Interface:** `POST /api/v1/practice/sessions/:id/answers`, `POST /api/v1/exam/sessions/:id/submit`, `GET /api/v1/leaderboard/:examSession`.
- **Test Cases:**
  - Submit correct practice answer -> returns `{ isCorrect: true, correctOption: "..." }`.
  - Submit exam with 10 correct and 4 wrong answers -> net score equals `10 - (4 * 0.5) = 8.0`.
  - Double submit exam -> returns 409 Conflict.
  - Leaderboard ranking -> correctly sorted by `score DESC`, then `timeTakenSeconds ASC`.

### Seam 4: Android Client Serialization Seam
- **Interface:** `AuthApi`, `PracticeApi`, `ExamApi`, `QuestionBankApi`.
- **Test Cases:**
  - Deserializes `{ success: true, data: ... }` seamlessly.
  - Throws `ApiException` on `{ success: false, message: "..." }`.
  - Android Gradle compilation (`./gradlew compileDebugKotlin`) succeeds with zero errors.

---

## 4. Acceptance Criteria

- [ ] All backend endpoints are served under `/api/v1` on Express 5.2 at `PORT=5000`.
- [ ] Prisma connects to Neon PostgreSQL using existing tables without data loss or schema destruction.
- [ ] Soft-delete fields (`is_deleted`, `deleted_at`) default to `false` and `null` for backward compatibility.
- [ ] All 9 fixed subjects (`BENGALI`, `ENGLISH`, `BD_INTERNATIONAL_AFFAIRS`, `GEOGRAPHY`, `SCIENCE`, `IT`, `MATH`, `MENTAL_ABILITY`, `ETHICS`) are strictly validated.
- [ ] BCS negative marking formula `max(0, correct - 0.5 * incorrect)` is precisely enforced.
- [ ] Admin CSV imports operate completely in-memory via `busboy` (no Multer, no Cloudinary).
- [ ] All responses adhere strictly to `{ success: boolean, message: string, data?: T, meta?: TMeta }`.
- [ ] Client layer `app/core/network` unwraps the envelope and provides full backward compatibility for `feature/*` UI screens.
- [ ] Stripe, Socket.IO, and PDFKit are completely removed from backend dependencies.

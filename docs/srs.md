# Software Requirements Specification

**Project:** Prostuti — BCS Exam Preparation App (KMP Course Project)
**Version:** 1.0
**Date:** August 26, 2026
**Prepared by:** Al-mizan
**Status:** Draft

---

## Table of Contents

1. Introduction
2. Overall Description
3. System Features (Functional Requirements)
4. External Interface Requirements
5. Non-Functional Requirements
6. Other Requirements
Appendix A — Data Model Summary
Appendix B — Traceability to Project Scope

---

## 1. Introduction

### 1.1 Purpose

This document specifies the functional and non-functional requirements for the Prostuti KMP course project: an Android application, built with Kotlin Multiplatform, that helps students prepare for the Bangladesh Civil Service (BCS) examination through a question bank and subject-wise practice, with a role-based admin panel for content management. It is written for the course instructor/evaluator and for the developer(s) building the system, and is intended to be read alongside `project_guide.md` (scope and priorities) and `backend_design.md` (technical design).

### 1.2 Document Conventions

- **Shall** denotes a mandatory (Core) requirement.
- **Should** denotes a desirable but non-blocking (Stretch) requirement.
- Requirements are numbered `FR-<AREA>-<n>` (functional) and `NFR-<n>` (non-functional) for traceability.
- Priority: **High** = required for submission, **Medium** = should be attempted if time allows, **Low** = optional/stretch.

### 1.3 Intended Audience and Reading Suggestions

Course evaluators should read Sections 1–3 for scope and behavior. Developers should read this document alongside `backend_design.md` (data model and API) and `.agents/skills/prostuti-conventions/SKILL.md` (implementation conventions) before building any feature.

### 1.4 Product Scope

Prostuti (this build) is a standalone, Android-only exam-prep app covering the BCS question bank and practice questions across nine fixed subjects, with no live/real-time exam functionality and CSV-based content entry for admins. It is a separate, simplified academic build and is distinct from the main cross-platform Prostuti product (Flutter + Next.js + Go), which is unaffected by this specification.

### 1.5 Definitions, Acronyms, and Abbreviations

| Term | Meaning |
|---|---|
| BCS | Bangladesh Civil Service examination |
| KMP | Kotlin Multiplatform |
| MCQ | Multiple-Choice Question |
| JWT | JSON Web Token |
| CSV | Comma-Separated Values |
| API | Application Programming Interface |
| SRS | Software Requirements Specification |
| MVVM | Model-View-ViewModel (UI architecture pattern) |
| DI | Dependency Injection |
| XP | Experience Points (gamification) |
| FR / NFR | Functional Requirement / Non-Functional Requirement |

### 1.6 References

- `project_guide.md` — scope, feature priority, build order
- `backend_design.md` — data model, API contract, CSV schema, auth design
- `.agents/skills/prostuti-conventions/SKILL.md` — code and architecture conventions

---

## 2. Overall Description

### 2.1 Product Perspective

This is a new, self-contained system: an Android client and its backend, both built in Kotlin within one project (see §2.5). It is not integrated with, and does not share a database or codebase with, the main Prostuti platform.

### 2.2 Product Functions (summary)

- Student registration, login, and role-based access
- Browsing the BCS question bank by exam session and subject
- Subject-wise practice with immediate feedback and scoring
- Solo, timed mock exams
- History of past attempts and previously wrong answers
- Per-exam-session leaderboard
- Basic profile, streaks, and XP
- Admin panel: CSV-based question import, question review/edit, user role management

### 2.3 User Classes and Characteristics

| User class | Description |
|---|---|
| **Student** | The primary user. Registers, logs in, browses the question bank, practices, takes mock exams, reviews history, views the leaderboard, requests explanations. No special technical knowledge assumed. |
| **Admin** | A privileged role on the same app. Imports and manages question content via CSV, reviews/edits/deletes questions, manages user roles. Assumed to be comfortable preparing a CSV file to a given template. |

### 2.4 Operating Environment

- Client: Android phones/tablets, single platform (no iOS/desktop target).
- Backend: a Ktor server process, part of the same project, backed by a managed PostgreSQL database (Neon).
- Network: the client requires an internet connection for all server-dependent features; there is no primary offline mode (offline caching is stretch scope, §3.10).

### 2.5 Design and Implementation Constraints

These are constraints imposed on the system, not features of it:

- The client **shall** be built using Kotlin Multiplatform, targeting **Android only**.
- The backend **shall** be included within the same project structure as the client (not a separately maintained service), sharing Kotlin model code with the client.
- The question bank **shall** cover **BCS only** — no Bank, Government, or NTRCA exam types.
- The system **shall not** implement any live/real-time exam functionality (no multiplayer battle mode, no real-time leaderboard push).
- Practice mode **shall** be limited to exactly nine fixed subjects (§3.4).
- Content entry for both question types **shall** be via CSV upload, admin-only.
- The architecture **shall** follow a feature-based modular structure.

### 2.6 User Documentation

No separate user manual is planned; the app is expected to be self-explanatory, supplemented by in-app onboarding screens where needed.

### 2.7 Assumptions and Dependencies

- Email + password authentication is used (no phone/OTP).
- The admin panel is a set of role-gated screens inside the same Android app, not a separate web tool.
- The backend depends on a managed Postgres instance (Neon) being reachable; local development may point at the same or a branched instance.

---

## 3. System Features (Functional Requirements)

### 3.1 Authentication & Role Management — Priority: High

| ID | Requirement |
|---|---|
| FR-AUTH-1 | The system shall allow a new user to register with name, email, and password. |
| FR-AUTH-2 | The system shall reject registration with an email already in use, with a clear error message. |
| FR-AUTH-3 | The system shall allow a registered user to log in with email and password and receive a session token on success. |
| FR-AUTH-4 | The system shall store passwords only as salted hashes, never in plaintext. |
| FR-AUTH-5 | The system shall assign every user exactly one role: Student or Admin. |
| FR-AUTH-6 | The system shall reject any request to an admin-only function from a non-admin user, regardless of client-side UI state (see NFR-SEC-3). |
| FR-AUTH-7 | The system shall keep a user logged in across app restarts until they explicitly log out or their session expires. |

### 3.2 Admin — Content Management (CSV Import) — Priority: High

| ID | Requirement |
|---|---|
| FR-ADMIN-1 | The system shall allow an Admin to upload a CSV file of BCS question-bank questions via a file picker. |
| FR-ADMIN-2 | The system shall allow an Admin to upload a CSV file of practice questions via a file picker. |
| FR-ADMIN-3 | The system shall validate each CSV row against the schema in `backend_design.md` §7 (required fields, subject must match one of the nine fixed values, correct option must be A/B/C/D) and reject invalid rows individually rather than failing the whole file. |
| FR-ADMIN-4 | The system shall report, after each import, the number of rows imported successfully and the number rejected, with a reason per rejected row. |
| FR-ADMIN-5 | The system shall allow an Admin to view, edit, and delete individual questions after import. |
| FR-ADMIN-6 | The system shall allow an Admin to view the list of registered users and change a user's role between Student and Admin. |
| FR-ADMIN-7 | All functions in this section shall be restricted to users with the Admin role, enforced on the server. |

### 3.3 Question Bank Browsing — Priority: High

| ID | Requirement |
|---|---|
| FR-QB-1 | The system shall allow a Student to browse BCS question-bank questions grouped by exam session (e.g. "45th BCS Preliminary"). |
| FR-QB-2 | The system shall allow a Student to filter question-bank questions by subject. |
| FR-QB-3 | The system shall display each question-bank question with its four options and its correct answer available for review. |
| FR-QB-4 | The system shall paginate question-bank results rather than loading an entire exam session at once. |

### 3.4 Practice Mode — Priority: High

| ID | Requirement |
|---|---|
| FR-PRAC-1 | The system shall allow a Student to choose one of exactly nine subjects — Bengali, English, Bangladesh & International Affairs, Geography, Science, IT, Math, Mental Ability, Ethics — and start a practice session. |
| FR-PRAC-2 | The system shall present practice questions one at a time, each with exactly four options. |
| FR-PRAC-3 | The system shall give immediate correct/incorrect feedback after each answer is submitted. |
| FR-PRAC-4 | The system shall compute and display a final score (correct out of total) when a practice session is finished. |
| FR-PRAC-5 | The system shall record every practice session and each answer given, for later retrieval in History (§3.6). |

### 3.5 Exam Mode — Priority: High

| ID | Requirement |
|---|---|
| FR-EXAM-1 | The system shall allow a Student to start a solo, timed BCS mock test. |
| FR-EXAM-2 | The system shall display a visible countdown timer during an exam attempt. |
| FR-EXAM-3 | The system shall not give per-question feedback during an exam attempt; answers are submitted together at the end. |
| FR-EXAM-4 | The system shall compute a final score and total time taken when an exam attempt is submitted. |
| FR-EXAM-5 | The system shall not support real-time or multiplayer exam participation. |

### 3.6 History — Priority: High

| ID | Requirement |
|---|---|
| FR-HIST-1 | The system shall allow a Student to view a list of their past practice and exam attempts, most recent first. |
| FR-HIST-2 | The system shall allow a Student to view a list of questions they have previously answered incorrectly. |
| FR-HIST-3 | For each wrong answer, the system shall show the question, the option the Student selected, and the correct option. |

### 3.7 Leaderboard — Priority: Medium

| ID | Requirement |
|---|---|
| FR-LB-1 | The system shall display a ranked leaderboard of Students' exam attempts for a given BCS exam session, ordered by score (descending), then time taken (ascending) as a tiebreaker. |
| FR-LB-2 | The leaderboard shall be computed from stored attempts at request time; it is not a live/real-time feed. |


### 3.9 Profile & Gamification — Priority: Medium

| ID | Requirement |
|---|---|
| FR-PROF-1 | The system shall allow a Student to view and edit their basic profile: name and avatar/mascot choice. |
| FR-PROF-2 | The system shall track a practice/exam streak counter for each Student. |
| FR-PROF-3 | The system shall award XP to a Student on completing a practice or exam session. |
| FR-PROF-4 | The system shall not implement a full XP economy, badge catalog, or leveling system. |

### 3.10 Stretch Features — Priority: Low (optional; select at most one unless time allows more)

| ID | Requirement |
|---|---|
| FR-STR-1 | The system should allow a Student to bookmark a question as important and view a list of bookmarked questions. |
| FR-STR-2 | The system should allow a Student to download a practice set for offline use. |
| FR-STR-3 | The system should allow a Student to send/accept friend requests and compare exam-session rank with a friend. |

### 3.11 Explicitly Excluded Requirements (Out of Scope)

The following are deliberately **not** requirements of this system, per the course constraints (§2.5) and scope decisions in `project_guide.md` §3:

- Live/real-time battle mode with real-time competitors
- Bank, Government, or NTRCA question types
- Job circular notifications
---

## 4. External Interface Requirements

### 4.1 User Interfaces

The client is a native Android app built with Jetpack Compose, supporting both Bangla and English text rendering. Screens follow the module breakdown in §3: authentication, question bank, practice, exam, history, leaderboard, profile, and (for Admins) content management.

### 4.2 Hardware Interfaces

Standard Android phone/tablet hardware; no special hardware (camera, sensors, biometrics) is required.

### 4.3 Software Interfaces

| Interface | Description |
|---|---|
| Backend API | REST API served by the embedded Ktor server, consumed by the Android client over HTTPS. |
| Database | Managed PostgreSQL (Neon), accessed by the backend via Exposed/JDBC. |

### 4.4 Communication Interfaces

All client-server communication is REST over HTTPS, with JSON request/response bodies (`kotlinx.serialization`). Authenticated requests carry a JWT bearer token issued at login (FR-AUTH-3).

---

## 5. Non-Functional Requirements

Numeric thresholds below are proposed defaults appropriate for a course-scale deployment, intended to make requirements testable — adjust them freely if they don't fit your grading criteria.

### 5.1 Performance

| ID | Requirement |
|---|---|
| NFR-PERF-1 | The system should load a screen's initial question list within 2 seconds under normal mobile network conditions (Wi-Fi or 4G). |
| NFR-PERF-2 | A CSV import of up to 500 rows should complete within 10 seconds. |
| NFR-PERF-3 | The first request after the database has been idle (Neon auto-suspend) may take longer than usual; this delay is expected and shall not be treated as a system failure. |

### 5.2 Security

| ID | Requirement |
|---|---|
| NFR-SEC-1 | Passwords shall be hashed (bcrypt) and never stored or logged in plaintext. |
| NFR-SEC-2 | All client-server traffic shall be encrypted in transit (HTTPS/TLS), including the database connection (Neon, `sslmode=require`). |
| NFR-SEC-3 | Authorization (role checks) shall be enforced on the server for every protected endpoint; client-side hiding of admin UI is a usability aid only, never the security boundary. |
| NFR-SEC-4 | Session tokens (JWT) shall have a defined expiry (proposed default: 24 hours) after which the user must log in again. |

### 5.3 Usability

| ID | Requirement |
|---|---|
| NFR-USE-1 | The UI shall correctly render Bangla-script question and answer text alongside English text. |
| NFR-USE-2 | Core flows (practice, exam) shall be operable by a first-time user without external instructions. |

### 5.4 Reliability & Availability

| ID | Requirement |
|---|---|
| NFR-REL-1 | An in-progress practice or exam session's answers shall not be lost if the app is briefly backgrounded. |
| NFR-REL-2 | The system is not required to meet production-grade uptime guarantees; brief downtime for maintenance or redeploys during the course period is acceptable. |

### 5.5 Maintainability

| ID | Requirement |
|---|---|
| NFR-MAIN-1 | The codebase shall follow the feature-based modular structure and conventions defined in `.agents/skills/prostuti-conventions/SKILL.md`. |
| NFR-MAIN-2 | Shared enums and DTOs (Role, Subject, QuestionType, SessionType) shall have a single source of truth in `core/model`, not be redefined per feature. |

### 5.6 Portability

Not applicable — the client is Android-only by course constraint (§2.5); no cross-platform portability is required or planned for this build.

---

## 6. Other Requirements

### 6.1 Data Requirements

See Appendix A and `backend_design.md` §5 for the full data model. All persisted data (users, questions, sessions, attempts, answers) resides in the managed PostgreSQL (Neon) database; no data is required to persist outside it beyond the client's session token.

### 6.2 Legal / Compliance

This is an academic project handling only account credentials and practice/exam activity data — no payment data is collected. Standard care (password hashing, HTTPS) as specified in §5.2 is considered sufficient for this scope.

---

## Appendix A — Data Model Summary

| Table | Purpose |
|---|---|
| `users` | Accounts and roles |
| `questions` | Both question-bank (`type=BANK`) and practice (`type=PRACTICE`) questions in one table |
| `practice_sessions` | A Student's practice attempt: subject, question set, score |
| `exam_attempts` | A Student's solo timed mock-test attempt: exam session, score, time taken |
| `answers` | Individual answers, shared across practice and exam sessions via `session_type` |

Wrong-answers (§3.6) and the leaderboard (§3.7) are derived by query, not stored as separate tables. Full column-level detail: `backend_design.md` §5.

## Appendix B — Traceability to Project Scope

| `project_guide.md` §3 scope tier | SRS sections |
|---|---|
| Core | §3.1–§3.9 (all High/Medium priority FRs) |
| Stretch | §3.10 (FR-STR-1..3) |
| Deferred | §3.11 (explicitly excluded) |
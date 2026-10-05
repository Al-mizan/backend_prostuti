# Chorcha.net to Prostuti KMP — UX & Design Mapping

This document specifies how **Chorcha** ([chorcha.net](https://chorcha.net/)) UI patterns and product flows are adapted into **Prostuti's Android Jetpack Compose** architecture while strictly adhering to [`docs/project_guide.md`](file:///home/almizan/Other%20Locations/workspace/Projects/hobby/prostuti/prostuti_app/backend/docs/project_guide.md) and [`docs/backend_design.md`](file:///home/almizan/Other%20Locations/workspace/Projects/hobby/prostuti/prostuti_app/backend/docs/backend_design.md).

---

## 1. Design Language & Tokens (`core/designsystem`)

Chorcha's web styling is translated into Prostuti's native Compose theme:

- **Primary Brand Color**: Crimson Red (`#DC143C` / `Color(0xFFDC143C)`), matching Prostuti's identity, paired with warm neutral backgrounds (`#F8F9FA` for light mode).
- **Secondary / Accent**: Deep Slate / Charcoal (`#1F2937`) for high-contrast Bengali text; Amber Gold (`#F59E0B`) for streaks and XP badges.
- **Typography**: Native support for Bengali script (`SolaimanLipi` or Google Fonts `Noto Serif Bengali` / `Hind Siliguri`) alongside Roboto for Latin numerals and English text.
- **Reusable Card & Chip System**:
  - `McqQuestionCard`: Shared question display with option radio chips (A, B, C, D) and immediate visual feedback (Green `#10B981` on correct, Crimson Red `#DC143C` on incorrect).
  - `SubjectChip`: Color-coded pill tag for the 9 fixed subjects.
  - `SessionHeader`: BCS session badge (e.g., "৪৫তম বিসিএস প্রিলিমিনারি").

---

## 2. Screen-by-Screen Architectural Mapping

### Screen 1: Dashboard (`androidApp` & `feature/practice`)
- **Chorcha Concept**: Welcome banner, active streak flame, daily goal progress, quick subject launch tiles, recent exam summary.
- **Prostuti Implementation**:
  - **Header**: Greeting with student name, avatar, and streak counter (`StreakBadge`).
  - **Quick Practice Grid**: 9 subject cards displaying the fixed subjects (`Subject` enum: BENGALI, ENGLISH, BD_INTERNATIONAL_AFFAIRS, etc.) with completion/mastery indicators.
  - **Recent Mock Performance**: Card showing latest solo BCS mock test score and a "Retake / New Exam" CTA button navigating to `feature/exam`.

### Screen 2: Question Bank (`feature/questionbank`)
- **Chorcha Concept**: BCS Preliminary archive organized by exam year (10th to 46th BCS) and subject filters.
- **Prostuti Implementation**:
  - **Session Selector**: Vertical list / horizontal carousel of BCS Preliminary editions (e.g. `45th BCS Preliminary`, `44th BCS Preliminary`).
  - **Subject Filter Bar**: Horizontal scrollable `SubjectChip` row (filter by Bengali, English, Math, etc.).
  - **Question Cards**: Paginated question feed with collapsible Bengali explanations (`explanation` field from DB). Read-only browsing (no score calculation).

### Screen 3: Exam Mode (`feature/exam`)
- **Chorcha Concept**: Timed mock exam with question palette, countdown timer, question answer sheet, and submit modal.
- **Prostuti Implementation**:
  - **Solo Timed Mock Test** (strictly non-live / non-multiplayer per project constraints).
  - **Top Bar**: Fixed countdown timer (`time_taken_seconds` tracking) and progress indicator (e.g., "২৫ / ২০০").
  - **Main Viewport**: Reuses `McqQuestionCard` from `core/designsystem`. Students select options with instant local state updates.
  - **Question Palette**: Bottom sheet or sliding drawer allowing quick jumping between answered, unanswered, and flagged questions.
  - **Submission**: Single batch submission via `POST /api/v1/exam/sessions/{id}/submit`.

### Screen 4: History & Review (`feature/history`)
- **Chorcha Concept**: Past test records, breakdown of accuracy, and "Mistake Bank" (ভুল উত্তরসমূহ).
- **Prostuti Implementation**:
  - **Tab 1 — Attempts List**: Past sessions (practice & exams) with date, score, total questions, and time spent (from `GET /api/v1/history/attempts`).
  - **Tab 2 — Wrong Answers (Mistake Review)**: Derived view from `GET /api/v1/history/wrong-answers`. Displays question, user's incorrect choice in red, correct choice in green, and the full explanation.
  - **AI Explain Action**: Button calling `POST /api/v1/practice/questions/{id}/explain` for automated on-demand AI breakdown of difficult questions.

### Screen 5: Leaderboard (`feature/exam` / `feature/history`)
- **Chorcha Concept**: Exam rankings showing rank badges (1st, 2nd, 3rd podium), participant names, scores, and completion times.
- **Prostuti Implementation**:
  - **Endpoint**: `GET /api/v1/leaderboard/{examSession}`.
  - **Data Source**: Server-side derived query ranking `exam_attempts` by `(score DESC, time_taken_seconds ASC)`.
  - **UI Layout**:
    - **Top 3 Podium**: Visual cards/avatars for 1st, 2nd, and 3rd place with gold, silver, bronze borders.
    - **Ranked List**: Scrollable list of ranks 4+ showing User Name, Score, and Time Taken.
    - **Current User Sticky Bar**: Pinned bar at the bottom showing the logged-in student's own rank and score for that exam session.

---

## 3. Strict Boundary Rules

1. **No Live Battle / Multiplayer**: Chorcha has live battle quizzes; Prostuti strictly limits Exam Mode to solo timed mock tests.
2. **Fixed 9 Subjects**: Chorcha may group subtopics dynamically; Prostuti strictly organizes practice questions under the fixed 9-enum list.
3. **Admin CSV Pipeline**: All scraped and curated question bank data flows through `CsvImporter.kt` and `POST /api/v1/admin/question-bank/import`.

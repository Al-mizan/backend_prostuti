# Prostuti Backend Service

Standalone TypeScript + Express.js + Prisma backend for the Prostuti BCS Exam Preparation Platform.

---

## 1. Tech Stack

- **Runtime**: Node.js 22+ (ESM)
- **Language**: TypeScript ^5.9
- **Framework**: Express.js ^5.2
- **ORM**: Prisma ^7.10 with `@prisma/adapter-pg`
- **Database**: PostgreSQL (Neon Serverless)
- **Cache**: Redis ^4.7 with resilient in-memory `Map` fallback
- **Auth**: Passport.js + `passport-jwt` + `passport-google-oauth20` + bcrypt (cost: 10)
- **Validation**: Zod ^4.6
- **Multipart/CSV**: In-memory streaming via `busboy` + `csv-parse` (zero Multer/Cloudinary dependencies)
- **Testing**: Vitest ^3.0 + Supertest ^7.0

---

## 2. Architecture & Modules

Every domain module under `src/app/module/` follows the strict 6-file convention:
- `<module>.constant.ts`
- `<module>.controller.ts`
- `<module>.interface.ts`
- `<module>.route.ts`
- `<module>.service.ts`
- `<module>.validation.ts`

### Implemented Modules:
1. **`auth`**: Student registration, password login, Google Sign-In verification, one-shot `X-Bootstrap-Token` admin seeding, `GET /me`.
2. **`user`**: Student profile retrieval & updates, admin user management.
3. **`questionBank`**: Grouped BCS Preliminary exam sessions (50th down to 10th with dynamic question counts), paginated question browsing.
4. **`practice`**: 9-subject practice session generation, real-time answer feedback with explanations, session completion & scoring.
5. **`exam`**: Timed solo BCS mock exam attempts, atomic submission with BCS negative marking (`+1.0` correct, `-0.5` incorrect), and ranked leaderboards (`score DESC, timeTakenSeconds ASC`).
6. **`history`**: Chronological attempt summaries across practice and exam modes, derived wrong-answers review.
7. **`admin`**: In-memory streaming CSV question imports (`question-bank` and `practice-questions`), row-by-row Zod validation with rejection reporting, question CRUD with referential protection, and user role management with last-admin demotion safeguards.

---

## 3. Getting Started

### Prerequisites:
- Node.js 22+
- `pnpm` 10+
- PostgreSQL database (e.g., Neon connection string)

### Environment Configuration:
Create `.env` in `backend/` (or copy from `.env.example`):
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgres://user:password@host/dbname?sslmode=require"
JWT_SECRET="your-jwt-secret-key-at-least-32-chars-long"
BOOTSTRAP_TOKEN="dev-bootstrap-secret-token"
REDIS_URL="redis://localhost:6379" # Optional; falls back to in-memory cache if unreachable
```

### Commands:
```bash
# Install dependencies
pnpm install

# Generate Prisma Client
pnpm run generate

# Run in development mode with auto-reload
pnpm run dev

# Typecheck
pnpm run typecheck

# Run test suite (76 tests across 9 test files)
pnpm test

# Build for production
pnpm run build

# Start production server
pnpm start
```

---

## 4. API Response Envelope

All API endpoints strictly return standardized JSON responses:

### Success Response:
```json
{
  "success": true,
  "message": "Human-readable status message",
  "data": { ... },
  "meta": {
    "page": 0,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response:
```json
{
  "success": false,
  "message": "Error description",
  "errorSources": [
    {
      "path": "email",
      "message": "Invalid email address"
    }
  ]
}
```

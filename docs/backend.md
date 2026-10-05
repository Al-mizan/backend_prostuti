# Backend Architecture Blueprint

> Reusable backend blueprint extracted from a production TypeScript + Express + Prisma codebase.
> Give this file along with your new project's concept to generate a structurally identical backend.

---

## 1. Tech Stack

| Layer | Technology | Version Range |
|---|---|---|
| Runtime | Node.js | 22+ (Alpine for Docker) |
| Language | TypeScript | ^5.9 |
| Framework | Express.js | ^5.2 (ESM) |
| ORM | Prisma | ^7.x (with `@prisma/adapter-pg`) |
| Database | PostgreSQL | 15+ |
| Cache | Redis | 6+ (via `redis` npm package) |
| Auth | Passport.js + passport-google-oauth20 | ^0.7 + ^2.0 (JWT Bearer + Google OAuth + local password) |
| Validation | Zod | ^4.x |
| File Upload | Multer + Cloudinary | multer ^2.1 + cloudinary ^2.9 |
| Payments | Stripe | ^22.x |
| Email | Nodemailer + EJS templates | nodemailer ^8.x |
| PDF Generation | PDFKit | ^0.18 |
| Real-time | Socket.IO | ^4.8 |
| API Docs | swagger-ui-express + hand-written OpenAPI 3.0 | |
| Testing | Vitest + Supertest | vitest ^5.x |
| Linting | ESLint + typescript-eslint | flat config |
| Package Manager | pnpm | ^10.x |
| Module System | ESM (`"type": "module"`) | |

---

## 2. Project Structure

```
backend/
├── prisma/
│   ├── schema/                    # Multi-file Prisma schema (one .prisma per domain entity)
│   │   ├── schema.prisma          # Generator + datasource config
│   │   ├── enums.prisma           # All shared enums
│   │   ├── auth.prisma            # User, Session, Account, Verification models
│   │   ├── admin.prisma
│   │   ├── doctor.prisma
│   │   ├── patient.prisma
│   │   ├── appointment.prisma
│   │   ├── schedule.prisma
│   │   ├── payment.prisma
│   │   ├── prescription.prisma
│   │   ├── review.prisma
│   │   ├── specialty.prisma
│   │   └── <domain>.prisma        # One file per domain entity
│   ├── migrations/
│   └── sql/                       # Raw SQL scripts (extensions, indexes)
├── prisma.config.ts               # Prisma config with dotenv
├── src/
│   ├── app.ts                     # Express app setup (middleware, routes, cron)
│   ├── server.ts                  # HTTP server bootstrap, Socket.IO init, graceful shutdown
│   ├── generated/prisma/          # Auto-generated Prisma client (gitignored)
│   └── app/
│       ├── config/
│       │   ├── env.ts             # Typed env loader with validation
│       │   ├── cloudinary.config.ts
│       │   ├── multer.config.ts
│       │   └── stripe.config.ts
│       ├── docs/
│       │   └── openapi.ts         # Hand-written OpenAPI 3.0 spec object
│       ├── errorHelpers/
│       │   ├── AppError.ts        # Custom operational error class
│       │   ├── handlePrismaErrors.ts
│       │   └── handleZodError.ts
│       ├── interface/
│       │   ├── error.interface.ts
│       │   ├── index.d.ts         # Express Request augmentation (req.user)
│       │   ├── query.interface.ts # QueryBuilder types
│       │   └── requestUser.interface.ts
│       ├── lib/
│       │   ├── passport.ts        # Passport configuration (Google OAuth, JWT strategy)
│       │   ├── prisma.ts          # PrismaClient singleton
│       │   ├── redis.ts           # RedisService class (cache + rate limiting)
│       │   └── socket.ts          # Socket.IO init + auth middleware
│       ├── middleware/
│       │   ├── checkAuth.ts       # Session + JWT + role-based auth guard
│       │   ├── globalErrorHandler.ts
│       │   ├── notFound.ts
│       │   ├── rateLimit.ts       # Tiered rate limiting (auth: 10/min, general: 100/min)
│       │   └── validateRequest.ts # Zod body validation middleware
│       ├── module/
│       │   ├── <moduleName>/      # One folder per domain module
│       │   │   ├── <moduleName>.constant.ts
│       │   │   ├── <moduleName>.controller.ts
│       │   │   ├── <moduleName>.interface.ts
│       │   │   ├── <moduleName>.route.ts
│       │   │   ├── <moduleName>.service.ts
│       │   │   ├── <moduleName>.validation.ts
│       │   │   ├── <moduleName>.utils.ts       # (optional)
│       │   │   ├── <moduleName>.middlewares.ts  # (optional)
│       │   │   └── __tests__/                   # (optional) unit tests
│       │   │       └── <moduleName>.*.test.ts
│       │   └── ...
│       ├── routes/
│       │   └── index.ts           # Central route registry
│       ├── shared/
│       │   ├── catchAsync.ts      # Async error wrapper HOF
│       │   └── sendResponse.ts    # Standardized JSON response helper
│       ├── templates/             # EJS email/PDF templates
│       │   ├── otp.ejs
│       │   ├── invoice.ejs
│       │   ├── prescription.ejs
│       │   └── googleRedirect.ejs
│       └── utils/
│           ├── QueryBuilder.ts    # Fluent Prisma query builder (search, filter, paginate, sort)
│           ├── cookies.ts
│           ├── email.ts           # sendEmail() with EJS rendering
│           ├── jwt.ts             # JWT create/verify/decode wrappers
│           ├── token.ts           # Token generation + cookie setters
│           ├── seed.ts            # Super admin seeder
│           ├── deleteUploadedFilesFromGlobalErrorHandler.ts
│           └── __tests__/
│               └── QueryBuilder.test.ts
├── tests/
│   ├── setup.ts                   # Vitest global setup (env vars, mock resets)
│   ├── app.test.ts                # Express app-level tests
│   ├── integration/               # Integration tests
│   │   ├── auth.test.ts
│   │   ├── appointment.test.ts
│   │   └── paymentWebhook.test.ts
│   └── *.test.ts                  # Other test files
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── Dockerfile.dev
├── Dockerfile.prod
├── .dockerignore
├── .env.example
├── .gitignore
└── typedoc.json
```

---

## 3. Module Architecture Pattern

Every domain feature lives in `src/app/module/<moduleName>/` and follows a strict **6-file convention** (with optional extras):

### 3.1 Required Files

| File | Purpose | Export Pattern |
|---|---|---|
| `<module>.constant.ts` | Searchable fields, filterable fields, include configs | Named exports (`const`) |
| `<module>.controller.ts` | Request handlers wrapped in `catchAsync` | Object export: `export const <Module>Controller = { ... }` |
| `<module>.interface.ts` | TypeScript interfaces for payloads/DTOs | Named interface exports |
| `<module>.route.ts` | Express Router with middleware chain | `export const <Module>Routes = router` |
| `<module>.service.ts` | Business logic (Prisma queries, transactions) | Object export: `export const <Module>Service = { ... }` |
| `<module>.validation.ts` | Zod schemas for request body validation | Object/named export |

### 3.2 Optional Files

| File | When to Add |
|---|---|
| `<module>.utils.ts` | Module-specific utility functions (PDF generation, data transformation) |
| `<module>.middlewares.ts` | Module-specific Express middleware (file processing, body transformation) |
| `__tests__/<module>.*.test.ts` | Unit tests for the module's service layer |

### 3.3 Naming Convention

- **Folder**: `camelCase` (e.g., `doctorSchedule/`, `videoCall/`)
- **Files**: `<moduleName>.<type>.ts` in `camelCase` (e.g., `doctorSchedule.service.ts`)
- **Exports**: `PascalCase` + type suffix (e.g., `DoctorScheduleController`, `DoctorScheduleService`, `DoctorScheduleRoutes`)

---

## 4. Code Patterns & Conventions

### 4.1 Controller Pattern

Every controller function follows this exact shape:

```typescript
import { Request, Response } from "express";
import status from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { <Module>Service } from "./<module>.service";
import { IqueryParams } from "../../interface/query.interface";

const getAllItems = catchAsync(
    async (req: Request, res: Response) => {
        const query = req.query;
        const result = await <Module>Service.getAllItems(query as IqueryParams);

        sendResponse(res, {
            httpStatusCode: status.OK,
            success: true,
            message: "Items fetched successfully",
            data: result.data,
            meta: result.meta,
        });
    }
);

const getItemById = catchAsync(
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const result = await <Module>Service.getItemById(id as string);

        sendResponse(res, {
            httpStatusCode: status.OK,
            success: true,
            message: "Item fetched successfully",
            data: result,
        });
    }
);

const createItem = catchAsync(
    async (req: Request, res: Response) => {
        const payload = req.body;
        const result = await <Module>Service.createItem(payload);

        sendResponse(res, {
            httpStatusCode: status.CREATED,
            success: true,
            message: "Item created successfully",
            data: result,
        });
    }
);

const updateItem = catchAsync(
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const payload = req.body;
        const user = req.user;  // when auth-dependent

        const result = await <Module>Service.updateItem(id as string, payload, user);

        sendResponse(res, {
            httpStatusCode: status.OK,
            success: true,
            message: "Item updated successfully",
            data: result,
        });
    }
);

const deleteItem = catchAsync(
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const result = await <Module>Service.deleteItem(id as string);

        sendResponse(res, {
            httpStatusCode: status.OK,
            success: true,
            message: "Item deleted successfully",
            data: result,
        });
    }
);

export const <Module>Controller = {
    getAllItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem,
};
```

**Key rules**:
- Always use `catchAsync` wrapper — never manual try/catch in controllers
- Always use `sendResponse` for consistent JSON envelope
- Use `http-status` constants, not magic numbers
- Destructure `req.params`, `req.body`, `req.query`, `req.user`
- Controllers are THIN — all logic lives in the service layer

### 4.2 Service Pattern

```typescript
import status from "http-status";
import { <Model>, Prisma } from "../../../generated/prisma/client";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { IqueryParams } from "../../interface/query.interface";
import { <module>SearchableFields, <module>FilterableFields, <module>IncludeConfig } from "./<module>.constant";

const getAllItems = async (query: IqueryParams) => {
    const queryBuilder = new QueryBuilder<
        <Model>,
        Prisma.<Model>WhereInput,
        Prisma.<Model>Include
    >(
        prisma.<model>,
        query,
        {
            searchableFields: <module>SearchableFields,
            filterableFields: <module>FilterableFields,
        }
    );

    const result = await queryBuilder
        .search()
        .filter()
        .where({ isDeleted: false })
        .include({ user: true })
        .dynamicInclude(<module>IncludeConfig)
        .paginate()
        .sort()
        .fields()
        .execute();

    return result;
};

const getItemById = async (id: string) => {
    const item = await prisma.<model>.findUniqueOrThrow({
        where: { id },
        include: { /* relations */ },
    });
    return item;
};

const createItem = async (payload: ICreatePayload) => {
    const item = await prisma.<model>.create({
        data: payload,
    });
    return item;
};

const updateItem = async (id: string, payload: IUpdatePayload) => {
    await prisma.<model>.findUniqueOrThrow({ where: { id } });

    const updated = await prisma.<model>.update({
        where: { id },
        data: payload,
    });
    return updated;
};

// Soft delete pattern
const deleteItem = async (id: string) => {
    await prisma.<model>.findUniqueOrThrow({ where: { id } });

    const result = await prisma.$transaction(async (tx) => {
        await tx.<model>.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
            },
        });

        await tx.user.update({
            where: { id: item.userId },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                status: UserStatus.DELETED,
            },
        });

        // Clean up sessions/accounts
        await tx.session.deleteMany({ where: { userId: item.userId } });
        await tx.account.deleteMany({ where: { userId: item.userId } });

        return await getItemById(id);
    });

    return result;
};

export const <Module>Service = {
    getAllItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem,
};
```

**Key rules**:
- Services are the ONLY layer that touches Prisma
- Use `prisma.$transaction()` for multi-table mutations
- Use `findUniqueOrThrow` for existence checks (Prisma auto-throws NOT_FOUND)
- Throw `new AppError(status.XXX, "message")` for business rule violations
- Use `QueryBuilder` for all list endpoints with search/filter/paginate/sort
- Soft delete: set `isDeleted: true` + `deletedAt: new Date()` + update user status

### 4.3 Route Pattern

```typescript
import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { multerUpload } from "../../config/multer.config";
import { <Module>Controller } from "./<module>.controller";
import { <Module>Validation } from "./<module>.validation";

const router = Router();

// Public routes first
router.get("/", <Module>Controller.getAllItems);

// Protected routes with auth + role guard
router.post("/",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    multerUpload.single("file"),                        // optional: file upload
    validateRequest(<Module>Validation.createSchema),    // body validation
    <Module>Controller.createItem
);

router.get("/:id",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    <Module>Controller.getItemById
);

router.patch("/:id",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    validateRequest(<Module>Validation.updateSchema),
    <Module>Controller.updateItem
);

router.delete("/:id",
    checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
    <Module>Controller.deleteItem
);

export const <Module>Routes = router;
```

**Middleware chain order**: `checkAuth(roles...) → multerUpload (if file) → validateRequest(schema) → controller`

### 4.4 Validation Pattern (Zod)

```typescript
import z from "zod";

const createItemZodSchema = z.object({
    title: z.string("Title is required"),
    description: z.string("Description is required").optional(),
    fee: z.number().min(0).optional(),
});

const updateItemZodSchema = z.object({
    item: z.object({
        name: z.string().optional(),
        profilePhoto: z.url("Must be a valid URL").optional(),
        contactNumber: z.string().min(11).max(14).optional(),
    }).optional(),
});

export const <Module>Validation = {
    createItemZodSchema,
    updateItemZodSchema,
};
```

### 4.5 Constant Pattern

```typescript
export const <module>SearchableFields = ['name', 'email', 'user.name'];
export const <module>FilterableFields = ['name', 'email', 'status', 'user.role'];
export const <module>IncludeConfig = {
    user: true,
    appointments: { include: { doctor: true } },
};
```

### 4.6 Interface Pattern

```typescript
import { SomeEnum } from "../../../generated/prisma/enums";

export interface ICreateItemPayload {
    name: string;
    email: string;
}

export interface IUpdateItemPayload {
    item?: {
        name?: string;
        profilePhoto?: string;
    };
}
```

---

## 5. Route Registration

All module routes are registered in `src/app/routes/index.ts`:

```typescript
import { Router } from "express";
import { AuthRoutes } from "../module/auth/auth.route";
import { UserRoutes } from "../module/user/user.route";
// ... import all module routes

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/users", UserRoutes);
// ... register all routes with their base paths

export const IndexRoutes = router;
```

Then in `app.ts`: `app.use("/api/v1", IndexRoutes);`

**URL pattern**: `/api/v1/<plural-resource-name>`

---

## 6. Core Infrastructure

### 6.1 Express App Setup (`app.ts`)

```typescript
// Order of middleware matters:
1. app.set("query parser", qs.parse)      // Deep query string parsing
2. app.set("view engine", "ejs")           // EJS template engine
3. app.post("/webhook", express.raw(...))  // Stripe webhook (raw body, BEFORE json parser)
4. app.use(cors({ ... }))                  // CORS with credentials
5. app.use(compression({ ... }))           // Gzip (skip webhooks)
6. app.use(rateLimiter)                    // Tiered rate limiting
7. app.use(passport.initialize())         // Passport authentication initialization
8. app.use(express.urlencoded({ ... }))    // URL encoded parser
9. app.use(express.json())                 // JSON parser
10. app.use(cookieParser())                // Cookie parser
11. cron.schedule(...)                     // Background cron jobs
12. app.get/use (API docs routes)          // OpenAPI + Swagger UI
13. app.use("/api/v1", IndexRoutes)        // Main API routes
14. app.get("/", healthCheck)              // Health check
15. app.use(globalErrorHandler)            // Error handler (MUST be last route handler)
16. app.use(notFound)                      // 404 catch-all
```

### 6.2 Server Bootstrap (`server.ts`)

```typescript
const bootstrap = async () => {
    await seedSuperAdmin();                // Seed initial admin user
    await redisService.connect();          // Connect to Redis (fail gracefully)
    const httpServer = createServer(app);
    initSocketIO(httpServer);              // Attach Socket.IO
    server = httpServer.listen(PORT);
};

// Graceful shutdown handlers for SIGTERM, SIGINT, uncaughtException, unhandledRejection
```

### 6.3 Environment Config (`config/env.ts`)

- Type-safe `EnvConfig` interface with nested groups (EMAIL_SENDER, CLOUDINARY, STRIPE, RAG)
- Validates all required env vars at startup — throws `AppError` with specific missing var names
- Flat env vars mapped to nested object structure
- Exported as singleton: `export const envVars = loadEnvVariables()`

### 6.4 Prisma Client (`lib/prisma.ts`)

- Uses `@prisma/adapter-pg` for native PostgreSQL driver
- Singleton: `export { prisma }`
- Generated client output: `src/generated/prisma/` (gitignored)
- Multi-file schema under `prisma/schema/` (one `.prisma` file per domain entity)

### 6.5 Redis Service (`lib/redis.ts`)

A class-based singleton with:
- **Dual-layer caching**: Redis primary + in-memory `Map` fallback
- `withCache<T>(key, ttl, fetcher)` — cache-aside helper
- `deleteByPattern(pattern)` — wildcard cache invalidation
- `evaluateRateLimit(key, limit, windowMs)` — sliding window via Lua script (Redis) or in-memory fallback
- `computeQueryHash(query)` — deterministic query hashing for cache keys
- Graceful degradation: all operations fail silently if Redis is unavailable

**Cache key convention**: `<plural-entity>:<scope>:<hash>` e.g., `doctors:list:abc123`, `doctors:detail:uuid`, `specialties:all:hash`

### 6.6 Authentication (`lib/passport.ts` + `middleware/checkAuth.ts`)

**Passport + JWT Bearer Auth**:
1. **JWT Strategy**: Token extracted from `Authorization: Bearer <token>` or `accessToken` cookie → verified against `JWT_SECRET`.
2. **Google OAuth Strategy**: `passport-google-oauth20` handles Google OAuth callback, profile extraction, and user upsert.

**`checkAuth(...roles)` middleware**:
1. Extract Bearer token from `Authorization` header (or `accessToken` cookie).
2. Verify JWT and decode payload `{ userId, email, role }`.
3. Check user existence and status in DB (reject if user not found or inactive).
4. Check role authorization (`Role.ADMIN`, `Role.STUDENT`, etc.).
5. Attach `req.user = { userId, email, role }`.
6. Call `next()`.

### 6.7 Rate Limiting (`middleware/rateLimit.ts`)

Tiered system:
- **Auth tier**: 10 requests/60s per IP (login, register, password reset)
- **General tier**: 100 requests/60s per IP (all `/api/v1/*`)
- **Exemptions**: `/webhook`, `/api-docs`, `/api/v1/openapi.json`
- Uses Redis sorted sets (Lua script) with in-memory fallback

---

## 7. QueryBuilder

A fluent, chainable query builder for Prisma that handles all list endpoints:

```typescript
const result = await new QueryBuilder<Model, Prisma.ModelWhereInput, Prisma.ModelInclude>(
    prisma.model,
    req.query,
    {
        searchableFields: ['name', 'user.email', 'specialties.specialty.title'],
        filterableFields: ['status', 'appointmentFee', 'user.role'],
    }
)
    .search()           // Case-insensitive search across fields (supports 2/3-level nesting)
    .filter()           // Whitelisted filters with range operators (lt, gt, gte, lte)
    .where({ isDeleted: false })  // Custom Prisma WHERE conditions
    .include({ user: true })       // Static includes
    .dynamicInclude(includeConfig) // Client-requested includes via ?include=doctor,patient
    .paginate()         // ?page=1&limit=10 (max 100, defaults: page=1, limit=10)
    .sort()             // ?sortBy=user.name&sortOrder=asc (default: createdAt desc)
    .fields()           // ?fields=id,name (Prisma select, mutually exclusive with include)
    .execute();         // Parallel count() + findMany(), returns { data, meta }
```

**Response envelope**:
```json
{
    "success": true,
    "message": "Items fetched successfully",
    "data": [...],
    "meta": {
        "page": 1,
        "limit": 10,
        "total": 50,
        "totalPages": 5
    }
}
```

---

## 8. Error Handling

### 8.1 Error Classes

- **`AppError`**: Custom operational error with `statusCode` and `message`
- **Zod errors**: Transformed to structured `{ path, message }[]` with 400 status
- **Prisma errors**: 5 specialized handlers mapping Prisma error codes to HTTP status codes
  - P2002 (unique constraint) → 409 Conflict
  - P2025/P2001 (not found) → 404
  - P1000 (auth) → 401
  - P1010 (access denied) → 403
  - P1008 (timeout) → 504
  - P5011 (rate limit) → 429
- **Multer errors**: File size/type validation errors → 400

### 8.2 Global Error Handler

```typescript
// Standardized error response shape:
{
    "success": false,
    "message": "Error description",
    "errorSources": [
        { "path": "fieldName", "message": "Specific error detail" }
    ],
    "stack": "..." // Only in development
}
```

The handler also auto-deletes uploaded files (Cloudinary) on error.

### 8.3 Error Response Interface

```typescript
interface TErrorResponse {
    statusCode?: number;
    success: boolean;
    message: string;
    errorSources: TErrorSources[];
    error?: unknown;
    stack?: string;
}

interface TErrorSources {
    path: string;
    message: string;
}
```

---

## 9. Response Format

### 9.1 Success Response

```typescript
sendResponse(res, {
    httpStatusCode: 200,        // HTTP status code
    success: true,
    message: "Human-readable message",
    data: result,               // optional
    meta: { page, limit, total, totalPages },  // optional, for paginated lists
});
```

Output:
```json
{
    "success": true,
    "message": "Items fetched successfully",
    "data": { ... },
    "meta": { "page": 1, "limit": 10, "total": 50, "totalPages": 5 }
}
```

### 9.2 Error Response

```json
{
    "success": false,
    "message": "Error description",
    "errorSources": [{ "path": "email", "message": "Email already exists" }]
}
```

---

## 10. Prisma Schema Conventions

### 10.1 Multi-File Schema

- `prisma/schema/schema.prisma` — generator + datasource only
- `prisma/schema/enums.prisma` — all shared enums
- One `.prisma` file per domain entity (e.g., `doctor.prisma`, `patient.prisma`)
- `prisma.config.ts` at project root with schema path + migration path

### 10.2 Model Conventions

- Primary key: `id String @id @default(uuid())`
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Soft delete: `isDeleted Boolean @default(false)`, `deletedAt DateTime?`
- Table name mapping: `@@map("tableName")` using plural lowercase
- Relation field naming: `camelCase` matching the related model name

### 10.3 Schema Generator Config

```prisma
generator client {
    provider        = "prisma-client"
    output          = "../../src/generated/prisma"
    previewFeatures = ["postgresqlExtensions"]
}

datasource db {
    provider   = "postgresql"
    extensions = [vector]    // if needed
}
```

---

## 11. Authentication & Authorization

### 11.1 Auth Flow

1. **Register**: `POST /api/v1/auth/register` → validate input → hash password (bcrypt) → create User → return JWT token + user details
2. **Login**: `POST /api/v1/auth/login` → validate credentials → verify bcrypt hash → return JWT token + user details
3. **Google OAuth / Token**: `POST /api/v1/auth/google` (mobile Google ID token verification) and `GET /api/v1/auth/google` + callback (web redirect via `passport-google-oauth20`)
4. **Bootstrap Admin**: `POST /api/v1/auth/bootstrap-admin` (one-shot dev seed guarded by `X-Bootstrap-Token`)
5. **Me**: `GET /api/v1/me` → returns authenticated user role and id

### 11.2 Token Strategy

- **Bearer Token**: `Authorization: Bearer <accessToken>` header for mobile clients (and optional `accessToken` cookie for web)
- JWT payload: `{ userId, email, role }` (expires in 24 hours per `srs.md#L262`)

### 11.3 Role-Based Access

```typescript
checkAuth(Role.ADMIN, Role.SUPER_ADMIN)  // Only these roles can access
checkAuth()                                // Any authenticated user (when passing all roles)
```

---

## 12. Redis Caching Strategy

### 12.1 Cache-Aside Pattern

```typescript
// In service:
const cacheKey = `entities:list:${computeQueryHash(query)}`;
return await redisService.withCache(cacheKey, 1800, async () => {
    // Prisma query here
});
```

### 12.2 Cache Invalidation

```typescript
// After any create/update/delete:
await redisService.deleteByPattern("entities:list:*");
await redisService.deleteByPattern("entities:detail:*");
```

### 12.3 Key Naming Convention

```
<plural-entity>:<scope>:<identifier>
Examples:
  doctors:list:abc123def
  doctors:detail:uuid-here
  specialties:all:queryHash
  schedules:list:queryHash
```

---

## 13. File Upload Pipeline

1. **Multer** with CloudinaryStorage → uploads directly to Cloudinary
2. **File filter**: JPEG, PNG, WEBP, PDF only. Blocks executables.
3. **Size limit**: 25 MB
4. **Error cleanup**: Global error handler auto-deletes uploaded files from Cloudinary on request failure
5. **Route usage**: `multerUpload.single("file")` or `multerUpload.fields([{ name: "profilePhoto", maxCount: 1 }])`
6. **Multipart body**: `validateRequest` middleware auto-parses `req.body.data` (JSON string) for multipart forms

---

## 14. Payment Integration (Stripe)

- Webhook endpoint at `/webhook` (BEFORE json parser, uses `express.raw()`)
- Webhook handler processes: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`
- Idempotency via `stripeEventId` stored on Payment record
- Transaction wraps appointment status + payment status + schedule slot updates
- Invoice PDF generated via PDFKit → uploaded to Cloudinary → emailed to patient

---

## 15. Real-time (Socket.IO)

- Initialized on the HTTP server in `server.ts`
- Auth middleware verifies JWT from:
  - `socket.handshake.auth.token`
  - `Authorization: Bearer <token>` header
  - `accessToken` cookie
- Namespace/event-based handlers registered per feature (e.g., `videoCall.socket.ts`)
- `socket.data.user` carries authenticated user info

---

## 16. Testing Strategy

### 16.1 Setup

- **Framework**: Vitest (globals enabled, node environment)
- **Setup file**: `tests/setup.ts` — sets all env vars, resets mocks between tests
- **Coverage**: v8 provider, includes `src/app/**/*.ts`, excludes interfaces and server.ts

### 16.2 Test Organization

```
tests/
├── setup.ts              # Global setup
├── app.test.ts            # Express app-level (health check, rate limiting, swagger)
├── integration/
│   ├── auth.test.ts       # Auth flow integration tests
│   └── appointment.test.ts # Appointment booking integration tests
src/app/module/<module>/__tests__/
    └── <module>.*.test.ts # Unit tests for service layer
src/app/utils/__tests__/
    └── QueryBuilder.test.ts # Utility unit tests
```

### 16.3 Mocking Pattern

```typescript
// 1. Mock stripe and cron at the top of every integration test:
vi.mock('../../src/app/config/stripe.config', () => ({ stripe: { ... } }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

// 2. Hoist Prisma mocks:
const { mockModel } = vi.hoisted(() => ({
    mockModel: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('../../src/app/lib/prisma', () => ({
    prisma: { model: mockModel, $transaction: vi.fn(async (cb) => cb({ model: mockModel })) },
}));

// 3. Test with supertest:
const res = await request(app)
    .post('/api/v1/auth/register')
    .set('Cookie', ['better-auth.session_token=token', 'accessToken=jwt'])
    .send({ name: 'Jane', email: 'jane@test.com', password: 'Pass123!' });

expect(res.status).toBe(201);
expect(res.body.success).toBe(true);
```

---

## 17. TypeScript Configuration

```json
{
    "compilerOptions": {
        "module": "ESNext",
        "moduleResolution": "bundler",
        "target": "ES2023",
        "rootDir": "./",
        "outDir": "./dist",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
    },
    "include": ["src", "prisma.config.ts"],
    "exclude": ["node_modules", "dist"]
}
```

---

## 18. Docker Configuration

### 18.1 Development (`Dockerfile.dev`)

```dockerfile
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.x --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5000
CMD ["sh", "-lc", "CI=true pnpm install && pnpm generate && pnpm prisma migrate deploy && pnpm run dev"]
```

### 18.2 Production (`Dockerfile.prod`)

Multi-stage build:
1. **base**: Node 22 Alpine + pnpm
2. **deps**: Install dependencies
3. **builder**: Generate Prisma client + TypeScript build + prune dev deps
4. **runner**: Copy only dist, node_modules, prisma, templates

---

## 19. Scripts Reference

```json
{
    "start": "node dist/server.js",
    "dev": "tsx --watch src/server.ts",
    "build": "pnpm run clean && tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ./src/**/*.{ts,tsx}",
    "migrate": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "generate": "prisma generate",
    "studio": "prisma studio",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
}
```

---

## 20. Code Style Rules

1. **ESM only** — `"type": "module"` in package.json, `.ts` extensions in relative imports
2. **No classes** for controllers/services — use plain functions exported as object literals
3. **`const` arrow functions** for everything except the `AppError` class and `QueryBuilder` class
4. **`import type`** — use when importing only types
5. **Barrel exports** — avoid. Import directly from the specific file.
6. **Error messages** — human-readable, describe what went wrong and what the user can do
7. **Comments** — only for non-obvious business logic. No `// import X` style commented code in production.
8. **Variable naming**: `camelCase` for variables/functions, `PascalCase` for types/interfaces/classes, `UPPER_SNAKE_CASE` for env constants
9. **Interface naming**: Prefix with `I` for custom interfaces (e.g., `IRequestUser`, `IqueryParams`, `IUpdatePayload`)
10. **HTTP status codes**: Always use `http-status` package constants (e.g., `status.OK`, `status.NOT_FOUND`)
11. **Async/await** everywhere — no `.then()/.catch()` chains
12. **Soft delete** by default — never hard-delete user-facing records

---

## 21. Checklist: Generating a New Backend

When using this blueprint for a new project:

1. **Define domain entities** — List all models (e.g., User, Product, Order)
2. **Define enums** — Roles, statuses, types
3. **Define relationships** — One-to-one, one-to-many, many-to-many
4. **Create Prisma schemas** — One `.prisma` file per entity + `enums.prisma` + `schema.prisma`
5. **Create modules** — One folder per entity with 6 required files
6. **Register routes** — Add to `routes/index.ts`
7. **Configure env vars** — Update `config/env.ts` with project-specific vars
8. **Setup auth** — Configure `lib/auth.ts` with project-specific roles and social providers
9. **Add caching** — `withCache` + `deleteByPattern` in services for hot paths
10. **Add validation** — Zod schemas for all mutable endpoints
11. **Add tests** — Integration tests for auth flow + unit tests for complex service logic
12. **Configure Docker** — Update Dockerfiles with project-specific settings
13. **Write OpenAPI spec** — Hand-write the spec in `docs/openapi.ts`
14. **Create email templates** — EJS templates under `templates/`
15. **Seed data** — Update `utils/seed.ts` for initial admin user
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { envVars } from "../../src/app/config/env";
import { prisma } from "../../src/app/lib/prisma";
import { Role } from "../../src/generated/prisma/enums";
import { checkAuth } from "../../src/app/middleware/checkAuth";
import { globalErrorHandler } from "../../src/app/middleware/globalErrorHandler";

describe("Auth Module Integration Tests", () => {
  const testEmail = `vitest_auth_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  const testName = "Vitest Student";
  let authToken = "";
  let userId = "";

  afterAll(async () => {
    // Clean up created test users
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: "vitest_auth_" } },
          { email: { startsWith: "vitest_admin_" } },
        ],
      },
    });
  });

  describe("POST /api/v1/auth/register", () => {
    it("successfully registers a new student and returns JWT with role STUDENT", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: testName,
          email: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("User registered successfully");
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data).toHaveProperty("userId");
      expect(res.body.data.role).toBe("STUDENT");

      authToken = res.body.data.token;
      userId = res.body.data.userId;
    });

    it("rejects duplicate email registration with 400 and clear error message", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: "Duplicate User",
          email: testEmail,
          password: "AnotherPassword123!",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Email already registered");
    });

    it("rejects short password (< 8 chars) with 400 validation error", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: "Invalid User",
          email: `short_${Date.now()}@example.com`,
          password: "short",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("successfully logs in with valid credentials", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Login successful");
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data.userId).toBe(userId);
      expect(res.body.data.role).toBe("STUDENT");
    });

    it("rejects login with invalid password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: "WrongPassword999!",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Invalid credentials");
    });

    it("rejects login with non-existent email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "nonexistent_vitest_user@example.com",
          password: testPassword,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Invalid credentials");
    });
  });

  describe("GET /api/v1/me and GET /api/v1/auth/me", () => {
    it("returns 401 Unauthorized when no Bearer token is provided", async () => {
      const res = await request(app).get("/api/v1/me");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 200 with user profile when valid Bearer token is provided on /api/v1/me", async () => {
      const res = await request(app)
        .get("/api/v1/me")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(userId);
      expect(res.body.data.role).toBe("STUDENT");
    });

    it("returns 200 with user profile on /api/v1/auth/me alias", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(userId);
      expect(res.body.data.role).toBe("STUDENT");
    });
  });

  describe("POST /api/v1/auth/bootstrap-admin", () => {
    it("rejects bootstrap without X-Bootstrap-Token header with 401", async () => {
      const res = await request(app)
        .post("/api/v1/auth/bootstrap-admin")
        .send({
          name: "Admin User",
          email: `vitest_admin_${Date.now()}@example.com`,
          password: "AdminPassword123!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Invalid bootstrap token");
    });

    it("rejects bootstrap with wrong X-Bootstrap-Token header with 401", async () => {
      const res = await request(app)
        .post("/api/v1/auth/bootstrap-admin")
        .set("X-Bootstrap-Token", "incorrect-token")
        .send({
          name: "Admin User",
          email: `vitest_admin_${Date.now()}@example.com`,
          password: "AdminPassword123!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Invalid bootstrap token");
    });

    it("succeeds with valid X-Bootstrap-Token and returns admin token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/bootstrap-admin")
        .set("X-Bootstrap-Token", envVars.BOOTSTRAP_TOKEN)
        .send({
          name: "Admin User",
          email: `vitest_admin_${Date.now()}@example.com`,
          password: "AdminPassword123!",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data).toHaveProperty("userId");
      expect(res.body.data.role).toBe("ADMIN");
    });

    it("is idempotent when an admin already exists", async () => {
      const res = await request(app)
        .post("/api/v1/auth/bootstrap-admin")
        .set("X-Bootstrap-Token", envVars.BOOTSTRAP_TOKEN)
        .send({
          name: "Another Admin",
          email: `vitest_admin_second_${Date.now()}@example.com`,
          password: "AdminPassword123!",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data.role).toBe("ADMIN");
    });
  });

  describe("Role Guard checkAuth(Role.ADMIN)", () => {
    const roleTestApp = express();
    roleTestApp.use(express.json());
    roleTestApp.get(
      "/test-admin-guard",
      checkAuth(Role.ADMIN),
      (_req, res) => {
        res.status(200).json({ success: true, message: "Admin access granted" });
      }
    );
    roleTestApp.use(globalErrorHandler);

    it("rejects STUDENT user accessing ADMIN route with 403 Forbidden", async () => {
      const res = await request(roleTestApp)
        .get("/test-admin-guard")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Forbidden");
    });
  });

  describe("Health Check", () => {
    it("returns healthy status on GET /health", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("uptime");
    });
  });
});

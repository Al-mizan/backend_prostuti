import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { envVars } from "../../src/app/config/env";
import { prisma } from "../../src/app/lib/prisma";

describe("Model Test Module Integration Tests", () => {
  const adminEmail = `modeltest_admin_${Date.now()}@example.com`;
  const studentEmail = `modeltest_student_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  let adminToken = "";
  let adminUserId = "";
  let studentToken = "";
  let studentUserId = "";
  const createdModelTestIds: string[] = [];

  beforeAll(async () => {
    // 1. Create an admin user via bootstrap
    const adminRes = await request(app)
      .post("/api/v1/auth/bootstrap-admin")
      .set("X-Bootstrap-Token", envVars.BOOTSTRAP_TOKEN)
      .send({
        name: "ModelTest Admin",
        email: adminEmail,
        password: testPassword,
      });

    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.data.token;
    adminUserId = adminRes.body.data.userId;

    // 2. Create a standard student user
    const studentRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "ModelTest Student",
        email: studentEmail,
        password: testPassword,
      });

    expect(studentRes.status).toBe(201);
    studentToken = studentRes.body.data.token;
    studentUserId = studentRes.body.data.userId;
  });

  afterAll(async () => {
    if (createdModelTestIds.length > 0) {
      await prisma.modelTest.deleteMany({
        where: { id: { in: createdModelTestIds } },
      });
    }

    const userIds = [adminUserId, studentUserId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  describe("Admin CRUD & RBAC on Model Tests", () => {
    let createdTestId = "";

    it("rejects creating model test without auth with 401 Unauthorized", async () => {
      const res = await request(app).post("/api/v1/model-tests").send({
        title: "Unauthorized Test",
        examSession: "47th BCS Preliminary",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 7200000).toISOString(),
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects creating model test with STUDENT token with 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/model-tests")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          title: "Student Trying Test",
          examSession: "47th BCS Preliminary",
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("rejects invalid date range (endTime <= startTime) with 400 Validation Error", async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 1000);

      const res = await request(app)
        .post("/api/v1/model-tests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Invalid Dates Test",
          examSession: "47th BCS Preliminary",
          startTime: now.toISOString(),
          endTime: earlier.toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("successfully creates a model test via POST /api/v1/model-tests as ADMIN", async () => {
      const startTime = new Date(Date.now() + 100000);
      const endTime = new Date(Date.now() + 7300000);

      const res = await request(app)
        .post("/api/v1/model-tests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "47th BCS Special Model Test 1",
          description: "Comprehensive model test for preliminary exam",
          examSession: "47th BCS Preliminary",
          durationMinutes: 120,
          totalMarks: 200,
          totalQuestions: 200,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          isPublished: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.title).toBe("47th BCS Special Model Test 1");
      expect(res.body.data.status).toBe("UPCOMING");
      expect(res.body.data.durationMinutes).toBe(120);

      createdTestId = res.body.data.id;
      createdModelTestIds.push(createdTestId);
    });

    it("successfully creates a model test via dedicated route POST /api/v1/admin/model-tests", async () => {
      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date(Date.now() + 3600000);

      const res = await request(app)
        .post("/api/v1/admin/model-tests")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Active Live Model Test",
          description: "Currently ongoing test",
          examSession: "46th BCS Preliminary",
          durationMinutes: 120,
          totalMarks: 200,
          totalQuestions: 200,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          isPublished: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("LIVE");

      createdModelTestIds.push(res.body.data.id);
    });

    it("updates an existing model test via PATCH /api/v1/model-tests/:id", async () => {
      const res = await request(app)
        .patch(`/api/v1/model-tests/${createdTestId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Updated 47th BCS Special Model Test 1",
          durationMinutes: 150,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe("Updated 47th BCS Special Model Test 1");
      expect(res.body.data.durationMinutes).toBe(150);
    });

    it("returns 404 when updating non-existent model test", async () => {
      const nonExistentUuid = "00000000-0000-0000-0000-000000000000";
      const res = await request(app)
        .patch(`/api/v1/model-tests/${nonExistentUuid}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: "Won't Work" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("deletes a model test via DELETE /api/v1/admin/model-tests/:id", async () => {
      // Create a test to delete
      const tempTest = await prisma.modelTest.create({
        data: {
          title: "To Be Deleted",
          examSession: "47th BCS Preliminary",
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
          isPublished: true,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/admin/model-tests/${tempTest.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await prisma.modelTest.findUnique({
        where: { id: tempTest.id },
      });
      expect(check).toBeNull();
    });
  });

  describe("Public Model Test Queries & Status Categorization", () => {
    let expiredTestId = "";
    let liveTestId = "";
    let upcomingTestId = "";

    beforeAll(async () => {
      // Clean up prior model tests to isolate live and upcoming state
      await prisma.modelTest.deleteMany({});

      const now = Date.now();

      // 1. Expired test
      const expired = await prisma.modelTest.create({
        data: {
          title: "Expired BCS Test",
          examSession: "44th BCS Preliminary",
          startTime: new Date(now - 7200000),
          endTime: new Date(now - 3600000),
          isPublished: true,
        },
      });
      expiredTestId = expired.id;
      createdModelTestIds.push(expiredTestId);

      // 2. Live test
      const live = await prisma.modelTest.create({
        data: {
          title: "Currently Live BCS Test",
          examSession: "45th BCS Preliminary",
          startTime: new Date(now - 1800000),
          endTime: new Date(now + 1800000),
          isPublished: true,
        },
      });
      liveTestId = live.id;
      createdModelTestIds.push(liveTestId);

      // 3. Upcoming test
      const upcoming = await prisma.modelTest.create({
        data: {
          title: "Future Upcoming BCS Test",
          examSession: "48th BCS Preliminary",
          startTime: new Date(now + 3600000),
          endTime: new Date(now + 7200000),
          isPublished: true,
        },
      });
      upcomingTestId = upcoming.id;
      createdModelTestIds.push(upcomingTestId);
    });

    it("GET /api/v1/model-tests/live returns the currently active live model test", async () => {
      const res = await request(app).get("/api/v1/model-tests/live");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(liveTestId);
      expect(res.body.data.status).toBe("LIVE");
    });

    it("GET /api/v1/model-tests/live falls back to nearest upcoming test if no live test exists", async () => {
      // Temporarily mark live test as expired for this test
      await prisma.modelTest.update({
        where: { id: liveTestId },
        data: {
          startTime: new Date(Date.now() - 7200000),
          endTime: new Date(Date.now() - 3600000),
        },
      });

      try {
        const res = await request(app).get("/api/v1/model-tests/live");

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.id).toBe(upcomingTestId);
        expect(res.body.data.status).toBe("UPCOMING");
      } finally {
        // Restore live test
        await prisma.modelTest.update({
          where: { id: liveTestId },
          data: {
            startTime: new Date(Date.now() - 1800000),
            endTime: new Date(Date.now() + 1800000),
          },
        });
      }
    });

    it("GET /api/v1/model-tests returns all tests with derived status", async () => {
      const res = await request(app).get("/api/v1/model-tests");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      const expiredItem = res.body.data.find(
        (t: any) => t.id === expiredTestId
      );
      const liveItem = res.body.data.find((t: any) => t.id === liveTestId);
      const upcomingItem = res.body.data.find(
        (t: any) => t.id === upcomingTestId
      );

      expect(expiredItem?.status).toBe("EXPIRED");
      expect(liveItem?.status).toBe("LIVE");
      expect(upcomingItem?.status).toBe("UPCOMING");
    });

    it("GET /api/v1/model-tests?status=EXPIRED filters correctly", async () => {
      const res = await request(app).get("/api/v1/model-tests?status=EXPIRED");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      for (const item of res.body.data) {
        expect(item.status).toBe("EXPIRED");
      }
    });

    it("GET /api/v1/model-tests?status=UPCOMING filters correctly", async () => {
      const res = await request(app).get("/api/v1/model-tests?status=UPCOMING");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      for (const item of res.body.data) {
        expect(item.status).toBe("UPCOMING");
      }
    });
  });
});

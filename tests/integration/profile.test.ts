import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { prisma } from "../../src/app/lib/prisma";

describe("Profile Module Integration Tests", () => {
  const testEmail = `vitest_profile_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  const initialName = "Profile Test Student";
  let authToken = "";
  let userId = "";

  beforeAll(async () => {
    // Register user
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: initialName,
        email: testEmail,
        password: testPassword,
      });

    expect(res.status).toBe(201);
    authToken = res.body.data.token;
    userId = res.body.data.userId;
  });

  afterAll(async () => {
    // Clean up created user
    if (userId) {
      await prisma.user.deleteMany({
        where: { id: userId },
      });
    }
  });

  describe("GET /api/v1/profile", () => {
    it("returns 401 Unauthorized when no token provided", async () => {
      const res = await request(app).get("/api/v1/profile");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 200 OK with profile data for authenticated user", async () => {
      const res = await request(app)
        .get("/api/v1/profile")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Profile fetched successfully");
      expect(res.body.data).toEqual({
        id: userId,
        name: initialName,
        email: testEmail.toLowerCase(),
        role: "STUDENT",
        avatarId: "mascot_1",
        createdAt: expect.any(String),
      });
    });

    it("returns 200 OK on /api/v1/users/profile alias", async () => {
      const res = await request(app)
        .get("/api/v1/users/profile")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(userId);
    });
  });

  describe("PUT /api/v1/profile", () => {
    it("returns 401 Unauthorized when no token provided", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .send({ name: "Updated Name", avatarId: "mascot_3" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("updates name and avatarId successfully", async () => {
      const updatedName = "Updated Student Name";
      const updatedAvatar = "mascot_5";

      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: updatedName,
          avatarId: updatedAvatar,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Profile updated successfully");
      expect(res.body.data.name).toBe(updatedName);
      expect(res.body.data.avatarId).toBe(updatedAvatar);

      // Verify persistence via GET
      const getRes = await request(app)
        .get("/api/v1/profile")
        .set("Authorization", `Bearer ${authToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.name).toBe(updatedName);
      expect(getRes.body.data.avatarId).toBe(updatedAvatar);
    });

    it("rejects blank name with 400 Bad Request", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "   ",
          avatarId: "mascot_1",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });

    it("rejects name longer than 100 characters with 400 Bad Request", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "A".repeat(101),
          avatarId: "mascot_1",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });

    it("rejects blank avatarId with 400 Bad Request", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Valid Name",
          avatarId: "   ",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });
  });
});

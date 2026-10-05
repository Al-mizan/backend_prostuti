import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { envVars } from "../../src/app/config/env";
import { prisma } from "../../src/app/lib/prisma";
import {
  Difficulty,
  Option,
  QuestionType,
  Role,
  Subject,
} from "../../src/generated/prisma/enums";

describe("Admin Module Integration Tests", () => {
  const adminEmail = `admintest_admin_${Date.now()}@example.com`;
  const studentEmail = `admintest_student_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  let adminToken = "";
  let adminUserId = "";
  let studentToken = "";
  let studentUserId = "";
  const createdQuestionIds: string[] = [];

  beforeAll(async () => {
    // 1. Create an admin user via bootstrap
    const adminRes = await request(app)
      .post("/api/v1/auth/bootstrap-admin")
      .set("X-Bootstrap-Token", envVars.BOOTSTRAP_TOKEN)
      .send({
        name: "Admin User",
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
        name: "Regular Student",
        email: studentEmail,
        password: testPassword,
      });

    expect(studentRes.status).toBe(201);
    studentToken = studentRes.body.data.token;
    studentUserId = studentRes.body.data.userId;
  });

  afterAll(async () => {
    const userIds = [adminUserId, studentUserId].filter(Boolean);

    if (userIds.length > 0) {
      // 1. Delete answers for sessions belonging to test users
      const pSessions = await prisma.practiceSession.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const pIds = pSessions.map((p) => p.id);
      if (pIds.length > 0) {
        await prisma.answer.deleteMany({
          where: { sessionId: { in: pIds } },
        });
        await prisma.practiceSessionQuestion.deleteMany({
          where: { sessionId: { in: pIds } },
        });
        await prisma.practiceSession.deleteMany({
          where: { id: { in: pIds } },
        });
      }

      // 2. Delete any answers or session links referencing questions created by test users
      const userQuestions = await prisma.question.findMany({
        where: {
          OR: [
            { createdBy: { in: userIds } },
            { id: { in: createdQuestionIds } },
            { examSession: "46th BCS Test" },
            { questionText: { contains: "CSV Question" } },
          ],
        },
        select: { id: true },
      });
      const qIds = userQuestions.map((q) => q.id);

      if (qIds.length > 0) {
        await prisma.answer.deleteMany({
          where: { questionId: { in: qIds } },
        });
        await prisma.practiceSessionQuestion.deleteMany({
          where: { questionId: { in: qIds } },
        });
        await prisma.examAttemptQuestion.deleteMany({
          where: { questionId: { in: qIds } },
        });
        await prisma.question.deleteMany({
          where: { id: { in: qIds } },
        });
      }

      // 3. Delete test users
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  describe("Role Guard Enforcement", () => {
    it("returns 401 Unauthorized when accessing admin routes without token", async () => {
      const res = await request(app).get("/api/v1/admin/users");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 403 Forbidden when student accesses admin routes", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Forbidden");
    });

    it("allows ADMIN access to admin routes", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("In-Memory Streaming CSV Import", () => {
    it("rejects question bank CSV with header mismatch with 400 Bad Request", async () => {
      const invalidHeaderCsv = `invalid_header,subject,topic,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty
46th BCS Test,BENGALI,Topic,Question?,A,B,C,D,A,Exp,EASY
`;

      const res = await request(app)
        .post("/api/v1/admin/question-bank/import")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from(invalidHeaderCsv), "invalid.csv");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("header mismatch");
    });

    it("successfully imports valid question bank CSV and returns imported count", async () => {
      const validBankCsv = `exam_session,subject,topic,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty
46th BCS Test,BENGALI,Poetry,CSV Question 1: Who wrote Gitanjali?,Rabindranath Tagore,Kazi Nazrul Islam,Jibanananda Das,Michael Madhusudan Dutt,A,Won Nobel in 1913,EASY
46th BCS Test,MATH,Algebra,CSV Question 2: What is 2+2?,4,5,6,7,A,Arithmetic,EASY
`;

      const res = await request(app)
        .post("/api/v1/admin/question-bank/import")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from(validBankCsv), "valid_bank.csv");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.imported).toBe(2);
      expect(res.body.data.rejected).toEqual([]);
    });

    it("processes partial CSV: imports valid rows and records rejected rows with line numbers and reasons", async () => {
      // Row 1: Header
      // Row 2: Valid
      // Row 3: Invalid Subject
      // Row 4: Missing exam_session
      // Row 5: Missing question_text
      // Row 6: Invalid correct_option
      const mixedCsv = `exam_session,subject,topic,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty
46th BCS Test,IT,Hardware,CSV Question Valid: What is CPU?,Central Processing Unit,Computer Personal Unit,Central Processor,Central Power,A,CPU,EASY
46th BCS Test,INVALID_SUBJ,Hardware,CSV Question Bad Subj,A,B,C,D,A,Exp,EASY
,MATH,Algebra,CSV Question Missing Session,4,5,6,7,A,Exp,EASY
46th BCS Test,SCIENCE,Physics,,A,B,C,D,A,Exp,EASY
46th BCS Test,ENGLISH,Grammar,CSV Question Bad Correct Option,A,B,C,D,Z,Exp,EASY
`;

      const res = await request(app)
        .post("/api/v1/admin/question-bank/import")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from(mixedCsv), "mixed.csv");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.imported).toBe(1);
      expect(res.body.data.rejected.length).toBe(4);

      // Verify rejection details
      const rejections = res.body.data.rejected;
      expect(rejections.some((r: any) => r.reason.includes("subject") && r.rowNumber === 3)).toBe(true);
      expect(rejections.some((r: any) => r.reason.includes("exam_session required") && r.rowNumber === 4)).toBe(true);
      expect(rejections.some((r: any) => r.reason.includes("question_text required") && r.rowNumber === 5)).toBe(true);
      expect(rejections.some((r: any) => r.reason.includes("correct_option") && r.rowNumber === 6)).toBe(true);
    });

    it("successfully imports practice questions CSV", async () => {
      const practiceCsv = `subject,topic,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty
GEOGRAPHY,Climate,CSV Question Practice: Largest ocean?,Pacific,Atlantic,Indian,Arctic,A,Pacific Ocean,EASY
`;

      const res = await request(app)
        .post("/api/v1/admin/practice-questions/import")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from(practiceCsv), "practice.csv");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.imported).toBe(1);
      expect(res.body.data.rejected).toEqual([]);
    });
  });

  describe("Question Review & Lifecycle Management", () => {
    let questionToEditId = "";
    let questionLinkedId = "";

    beforeAll(async () => {
      // Create a standalone question for edit/delete
      const q1 = await prisma.question.create({
        data: {
          type: QuestionType.BANK,
          examSession: "46th BCS Test",
          subject: Subject.MATH,
          questionText: "Admin CRUD Question 1",
          optionA: "Opt A",
          optionB: "Opt B",
          optionC: "Opt C",
          optionD: "Opt D",
          correctOption: Option.A,
          createdBy: adminUserId,
        },
      });
      questionToEditId = q1.id;
      createdQuestionIds.push(q1.id);

      // Create a question linked to a session
      const q2 = await prisma.question.create({
        data: {
          type: QuestionType.PRACTICE,
          subject: Subject.GEOGRAPHY,
          questionText: "Admin Linked Question 2",
          optionA: "Opt A",
          optionB: "Opt B",
          optionC: "Opt C",
          optionD: "Opt D",
          correctOption: Option.B,
          createdBy: adminUserId,
        },
      });
      questionLinkedId = q2.id;
      createdQuestionIds.push(q2.id);

      // Link q2 to a practice session
      const pSession = await prisma.practiceSession.create({
        data: {
          userId: studentUserId,
          subject: Subject.GEOGRAPHY,
        },
      });

      await prisma.practiceSessionQuestion.create({
        data: {
          sessionId: pSession.id,
          questionId: q2.id,
          orderIndex: 0,
        },
      });
    });

    it("GET /api/v1/admin/questions returns paginated questions with meta envelope", async () => {
      const res = await request(app)
        .get("/api/v1/admin/questions?page=0&pageSize=10")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("items");
      expect(res.body.meta).toHaveProperty("page", 0);
      expect(res.body.meta).toHaveProperty("limit", 10);
      expect(res.body.meta).toHaveProperty("total");
    });

    it("PUT /api/v1/admin/questions/:id updates question content successfully", async () => {
      const res = await request(app)
        .put(`/api/v1/admin/questions/${questionToEditId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          subject: "MATH",
          topic: "Algebra Updated",
          questionText: "Admin CRUD Question 1 Updated Text",
          optionA: "New A",
          optionB: "New B",
          optionC: "New C",
          optionD: "New D",
          correctOption: "C",
          explanation: "Updated explanation",
          difficulty: "HARD",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(questionToEditId);
      expect(res.body.data.questionText).toBe("Admin CRUD Question 1 Updated Text");
      expect(res.body.data.correctOption).toBe("C");
      expect(res.body.data.difficulty).toBe("HARD");
      expect(res.body.data.topic).toBe("Algebra Updated");
    });

    it("DELETE /api/v1/admin/questions/:id refuses deleting linked question with 409 Conflict", async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/questions/${questionLinkedId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain(
        "Question is referenced by a saved session and cannot be deleted"
      );
    });

    it("DELETE /api/v1/admin/questions/:id deletes unlinked question successfully", async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/questions/${questionToEditId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Question deleted successfully");

      // Verify question is deleted in DB
      const dbQ = await prisma.question.findUnique({
        where: { id: questionToEditId },
      });
      expect(dbQ).toBeNull();
    });
  });

  describe("User Role Management & Last Admin Guard", () => {
    it("promotes a student to ADMIN and demotes back to STUDENT when multiple admins exist", async () => {
      // 1. Promote student to ADMIN
      const promoteRes = await request(app)
        .put(`/api/v1/admin/users/${studentUserId}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "ADMIN" });

      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.success).toBe(true);
      expect(promoteRes.body.data.role).toBe("ADMIN");

      // 2. Demote student back to STUDENT (succeeds because primary admin still exists)
      const demoteRes = await request(app)
        .put(`/api/v1/admin/users/${studentUserId}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "STUDENT" });

      expect(demoteRes.status).toBe(200);
      expect(demoteRes.body.success).toBe(true);
      expect(demoteRes.body.data.role).toBe("STUDENT");
    });

    it("refuses demoting the last remaining admin with 409 Conflict", async () => {
      // Currently, adminUserId is the only admin created in this test context
      // Verify total admins in DB
      const adminCount = await prisma.user.count({
        where: { role: Role.ADMIN, isDeleted: false },
      });

      if (adminCount === 1) {
        const res = await request(app)
          .put(`/api/v1/admin/users/${adminUserId}/role`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ role: "STUDENT" });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("Cannot demote the last remaining admin");
      } else {
        // If other tests left admins, demote until 1 admin remains to verify guard
        const allAdmins = await prisma.user.findMany({
          where: { role: Role.ADMIN, isDeleted: false },
        });

        // Demote all except the last one
        for (let i = 0; i < allAdmins.length - 1; i++) {
          await prisma.user.update({
            where: { id: allAdmins[i].id },
            data: { role: Role.STUDENT },
          });
        }

        const lastAdmin = allAdmins[allAdmins.length - 1];
        const res = await request(app)
          .put(`/api/v1/admin/users/${lastAdmin.id}/role`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ role: "STUDENT" });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("Cannot demote the last remaining admin");

        // Restore our adminUserId if needed
        await prisma.user.update({
          where: { id: adminUserId },
          data: { role: Role.ADMIN },
        });
      }
    });
  });
});

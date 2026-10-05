import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { prisma } from "../../src/app/lib/prisma";
import { Difficulty, Option, QuestionType, SessionType, Subject } from "../../src/generated/prisma/enums";

describe("Practice Module Integration Tests", () => {
  const testEmail = `vitest_practice_${Date.now()}@example.com`;
  const otherEmail = `vitest_other_practice_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  let authToken = "";
  let otherAuthToken = "";
  let userId = "";
  let otherUserId = "";
  const createdQuestionIds: string[] = [];

  beforeAll(async () => {
    // 1. Create primary student
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Practice Student",
        email: testEmail,
        password: testPassword,
      });

    expect(res.status).toBe(201);
    authToken = res.body.data.token;
    userId = res.body.data.userId;

    // 2. Create secondary student (to test isolation)
    const otherRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Other Student",
        email: otherEmail,
        password: testPassword,
      });

    expect(otherRes.status).toBe(201);
    otherAuthToken = otherRes.body.data.token;
    otherUserId = otherRes.body.data.userId;

    // 3. Seed 6 PRACTICE questions for IT subject
    for (let i = 1; i <= 6; i++) {
      const q = await prisma.question.create({
        data: {
          type: QuestionType.PRACTICE,
          subject: Subject.IT,
          questionText: `IT Practice Question #${i}: CPU meaning?`,
          optionA: "Central Processing Unit",
          optionB: "Computer Personal Unit",
          optionC: "Central Processor Union",
          optionD: "Central Performance Unit",
          correctOption: Option.A,
          explanation: "CPU stands for Central Processing Unit.",
          difficulty: Difficulty.EASY,
          createdBy: userId,
        },
      });
      createdQuestionIds.push(q.id);
    }
  });

  afterAll(async () => {
    const userIds = [userId, otherUserId].filter(Boolean);
    if (userIds.length > 0) {
      const userSessions = await prisma.practiceSession.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const sessionIds = userSessions.map((s) => s.id);
      if (sessionIds.length > 0) {
        await prisma.answer.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await prisma.practiceSessionQuestion.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await prisma.practiceSession.deleteMany({
          where: { id: { in: sessionIds } },
        });
      }
    }

    if (createdQuestionIds.length > 0) {
      await prisma.question.deleteMany({
        where: { id: { in: createdQuestionIds } },
      });
    }

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  });

  describe("POST /api/v1/practice/sessions", () => {
    it("returns 401 Unauthorized when no token is provided", async () => {
      const res = await request(app)
        .post("/api/v1/practice/sessions")
        .send({ subject: "IT", count: 5 });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects invalid subject with 400 validation error", async () => {
      const res = await request(app)
        .post("/api/v1/practice/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ subject: "PHYSICS", count: 5 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });

    it("rejects question count less than 5 with 400 validation error", async () => {
      const res = await request(app)
        .post("/api/v1/practice/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ subject: "IT", count: 4 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });

    it("rejects question count greater than 50 with 400 validation error", async () => {
      const res = await request(app)
        .post("/api/v1/practice/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ subject: "IT", count: 51 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });

    it("returns 404 when no questions exist for the subject", async () => {
      // Temporarily mark ETHICS questions as deleted to test 404 seam
      await prisma.question.updateMany({
        where: { subject: Subject.ETHICS },
        data: { isDeleted: true },
      });

      try {
        const res = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ subject: "ETHICS", count: 5 });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain("No questions available for subject");
      } finally {
        await prisma.question.updateMany({
          where: { subject: Subject.ETHICS },
          data: { isDeleted: false },
        });
      }
    });

    it("successfully creates a practice session and returns questions without answers", async () => {
      const res = await request(app)
        .post("/api/v1/practice/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ subject: "IT", count: 5 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Practice session started successfully");
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.subject).toBe("IT");
      expect(res.body.data.questions.length).toBe(5);

      // Verify questions do not leak correctOption or explanation
      for (const q of res.body.data.questions) {
        expect(q).toHaveProperty("id");
        expect(q).toHaveProperty("subject");
        expect(q).toHaveProperty("questionText");
        expect(q).toHaveProperty("optionA");
        expect(q).toHaveProperty("optionB");
        expect(q).toHaveProperty("optionC");
        expect(q).toHaveProperty("optionD");
        expect(q).toHaveProperty("examSession");
        expect(q).not.toHaveProperty("correctOption");
        expect(q).not.toHaveProperty("explanation");
      }
    });
  });

  describe("Practice Session Lifecycle: Submit Answer -> Finish -> 409 on subsequent answers", () => {
    let activeSessionId = "";
    let sessionQuestions: any[] = [];

    beforeAll(async () => {
      const startRes = await request(app)
        .post("/api/v1/practice/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ subject: "IT", count: 5 });

      expect(startRes.status).toBe(201);
      activeSessionId = startRes.body.data.id;
      sessionQuestions = startRes.body.data.questions;
    });

    it("submits a correct answer and returns immediate feedback with explanation", async () => {
      const firstQuestion = sessionQuestions[0];
      const dbQ = await prisma.question.findUniqueOrThrow({
        where: { id: firstQuestion.id },
      });

      const res = await request(app)
        .post(`/api/v1/practice/sessions/${activeSessionId}/answers`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          questionId: firstQuestion.id,
          selectedOption: dbQ.correctOption,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Answer submitted successfully");
      expect(res.body.data).toEqual({
        questionId: firstQuestion.id,
        selectedOption: dbQ.correctOption,
        isCorrect: true,
        correctOption: dbQ.correctOption,
        explanation: dbQ.explanation,
      });

      // Verify record in answers table
      const storedAnswer = await prisma.answer.findFirst({
        where: {
          sessionId: activeSessionId,
          questionId: firstQuestion.id,
          sessionType: SessionType.PRACTICE,
        },
      });
      expect(storedAnswer).toBeDefined();
      expect(storedAnswer?.isCorrect).toBe(true);
      expect(storedAnswer?.selectedOption).toBe(dbQ.correctOption);
    });

    it("submits an incorrect answer and returns immediate feedback", async () => {
      const secondQuestion = sessionQuestions[1];
      const dbQ = await prisma.question.findUniqueOrThrow({
        where: { id: secondQuestion.id },
      });
      const wrongOption = (["A", "B", "C", "D"] as const).find(
        (o) => o !== dbQ.correctOption
      )!;

      const res = await request(app)
        .post(`/api/v1/practice/sessions/${activeSessionId}/answers`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          questionId: secondQuestion.id,
          selectedOption: wrongOption,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isCorrect).toBe(false);
      expect(res.body.data.selectedOption).toBe(wrongOption);
      expect(res.body.data.correctOption).toBe(dbQ.correctOption);
    });

    it("rejects answer from another user with 404 Not Found", async () => {
      const res = await request(app)
        .post(`/api/v1/practice/sessions/${activeSessionId}/answers`)
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .send({
          questionId: sessionQuestions[2].id,
          selectedOption: "A",
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Practice session not found");
    });

    it("rejects answer with invalid questionId format with 400 validation error", async () => {
      const res = await request(app)
        .post(`/api/v1/practice/sessions/${activeSessionId}/answers`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          questionId: "not-a-uuid",
          selectedOption: "A",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });

    it("finishes session and computes scores correctly", async () => {
      const res = await request(app)
        .post(`/api/v1/practice/sessions/${activeSessionId}/finish`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Practice session finished successfully");
      expect(res.body.data).toEqual({
        sessionId: activeSessionId,
        subject: "IT",
        totalQuestions: 5,
        correctCount: 1,
        incorrectCount: 1,
        score: 1,
      });

      // Verify in DB
      const dbSession = await prisma.practiceSession.findUnique({
        where: { id: activeSessionId },
      });
      expect(dbSession?.score).toBe(1);
      expect(dbSession?.finishedAt).not.toBeNull();
    });

    it("rejects submitting answers after session is finished with 409 Conflict", async () => {
      const res = await request(app)
        .post(`/api/v1/practice/sessions/${activeSessionId}/answers`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          questionId: sessionQuestions[2].id,
          selectedOption: "A",
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Practice session is already finished");
    });
  });
});

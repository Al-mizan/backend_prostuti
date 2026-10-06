import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { prisma } from "../../src/app/lib/prisma";
import {
  Difficulty,
  Option,
  QuestionType,
  Subject,
} from "../../src/generated/prisma/enums";

describe("Exam Module Integration Tests", () => {
  const testEmail = `vitest_exam_${Date.now()}@example.com`;
  const otherEmail = `vitest_other_exam_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  const testSessionName = "45th BCS";
  let authToken = "";
  let otherAuthToken = "";
  let userId = "";
  let otherUserId = "";
  const createdQuestionIds: string[] = [];
  const createdModelTestIds: string[] = [];

  beforeAll(async () => {
    // 1. Create primary student
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "Exam Student 1",
      email: testEmail,
      password: testPassword,
    });

    expect(res.status).toBe(201);
    authToken = res.body.data.token;
    userId = res.body.data.userId;

    // 2. Create secondary student
    const otherRes = await request(app).post("/api/v1/auth/register").send({
      name: "Exam Student 2",
      email: otherEmail,
      password: testPassword,
    });

    expect(otherRes.status).toBe(201);
    otherAuthToken = otherRes.body.data.token;
    otherUserId = otherRes.body.data.userId;

    // 3. Seed 8 BANK questions for "45th BCS"
    for (let i = 1; i <= 8; i++) {
      const q = await prisma.question.create({
        data: {
          type: QuestionType.BANK,
          examSession: testSessionName,
          subject: Subject.BD_INTERNATIONAL_AFFAIRS,
          questionText: `BCS 45 Question #${i}: What is the capital of Bangladesh?`,
          optionA: "Dhaka",
          optionB: "Chittagong",
          optionC: "Rajshahi",
          optionD: "Khulna",
          correctOption: Option.A,
          explanation: "Dhaka is the capital of Bangladesh.",
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
      const attempts = await prisma.examAttempt.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const attemptIds = attempts.map((a) => a.id);
      if (attemptIds.length > 0) {
        await prisma.answer.deleteMany({
          where: { sessionId: { in: attemptIds } },
        });
        await prisma.examAttemptQuestion.deleteMany({
          where: { attemptId: { in: attemptIds } },
        });
        await prisma.examAttempt.deleteMany({
          where: { id: { in: attemptIds } },
        });
      }
    }

    if (createdQuestionIds.length > 0) {
      await prisma.answer.deleteMany({
        where: { questionId: { in: createdQuestionIds } },
      });
      await prisma.examAttemptQuestion.deleteMany({
        where: { questionId: { in: createdQuestionIds } },
      });
      await prisma.practiceSessionQuestion.deleteMany({
        where: { questionId: { in: createdQuestionIds } },
      });
      await prisma.question.deleteMany({
        where: { id: { in: createdQuestionIds } },
      });
    }

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    if (createdModelTestIds.length > 0) {
      await prisma.modelTest.deleteMany({
        where: { id: { in: createdModelTestIds } },
      });
    }
  });

  describe("POST /api/v1/exam/sessions", () => {
    it("returns 401 Unauthorized without auth token", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .send({ examSession: testSessionName, questionCount: 5 });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects question count less than 5 with 400 validation error", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ examSession: testSessionName, questionCount: 4 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects question count greater than 200 with 400 validation error", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ examSession: testSessionName, questionCount: 201 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 404 when session has no questions", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ examSession: "Nonexistent BCS 999", questionCount: 5 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("No questions found for session");
    });

    it("creates an exam session and returns questions without answers or explanations", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          examSession: testSessionName,
          questionCount: 6,
          durationMinutes: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Exam session started successfully");
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.examSession).toBe(testSessionName);
      expect(res.body.data.durationMinutes).toBe(20);
      expect(res.body.data.questions.length).toBe(6);

      for (const q of res.body.data.questions) {
        expect(q).toHaveProperty("id");
        expect(q).toHaveProperty("subject");
        expect(q).toHaveProperty("questionText");
        expect(q).toHaveProperty("optionA");
        expect(q).not.toHaveProperty("correctOption");
        expect(q).not.toHaveProperty("explanation");
      }
    });

    it("successfully creates an exam session with fallback matching (e.g. '45th BCS Preli')", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          examSession: "45th BCS Preli",
          questionCount: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.questions.length).toBe(5);
    });
  });

  describe("POST /api/v1/exam/sessions/:id/submit & BCS Negative Marking", () => {
    let activeSessionId = "";
    let examQuestions: any[] = [];

    beforeAll(async () => {
      const startRes = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          examSession: testSessionName,
          questionCount: 6,
          durationMinutes: 30,
        });

      expect(startRes.status).toBe(201);
      activeSessionId = startRes.body.data.id;
      examQuestions = startRes.body.data.questions;
    });

    it("rejects submit from another user with 404 Not Found", async () => {
      const res = await request(app)
        .post(`/api/v1/exam/sessions/${activeSessionId}/submit`)
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .send({
          timeTakenSeconds: 120,
          answers: [],
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Exam session not found");
    });

    it("correctly calculates BCS negative marking (+1.0 per correct, -0.5 per wrong, 0 per skipped)", async () => {
      // 6 questions:
      // q0: correct (A) -> +1.0
      // q1: correct (A) -> +1.0
      // q2: wrong (B) -> -0.5
      // q3: wrong (C) -> -0.5
      // q4: skipped (null) -> 0
      // q5: not in answers array (skipped) -> 0
      // Expected: correctCount=2, incorrectCount=2, skippedCount=2, netScore = 2 - (2*0.5) = 1.0
      const payloadAnswers = [
        { questionId: examQuestions[0].id, selectedOption: Option.A },
        { questionId: examQuestions[1].id, selectedOption: Option.A },
        { questionId: examQuestions[2].id, selectedOption: Option.B },
        { questionId: examQuestions[3].id, selectedOption: Option.C },
        { questionId: examQuestions[4].id, selectedOption: null },
      ];

      const res = await request(app)
        .post(`/api/v1/exam/sessions/${activeSessionId}/submit`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          timeTakenSeconds: 300,
          answers: payloadAnswers,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Exam submitted successfully");
      expect(res.body.data.sessionId).toBe(activeSessionId);
      expect(res.body.data.totalQuestions).toBe(6);
      expect(res.body.data.correctCount).toBe(2);
      expect(res.body.data.incorrectCount).toBe(2);
      expect(res.body.data.skippedCount).toBe(2);
      expect(res.body.data.score).toBe(1.0);
      expect(res.body.data.timeTakenSeconds).toBe(300);
      expect(res.body.data.questions.length).toBe(6);

      // Verify answers in DB
      const answersInDb = await prisma.answer.findMany({
        where: { sessionId: activeSessionId },
      });
      // 4 answers inserted (2 correct + 2 incorrect, skipped answers are not stored in answers table)
      expect(answersInDb.length).toBe(4);

      // Verify attempt score in DB is rounded integer
      const dbAttempt = await prisma.examAttempt.findUnique({
        where: { id: activeSessionId },
      });
      expect(dbAttempt?.finishedAt).not.toBeNull();
      expect(dbAttempt?.score).toBe(1);
    });

    it("refuses resubmitting an already-finished exam with 409 Conflict", async () => {
      const res = await request(app)
        .post(`/api/v1/exam/sessions/${activeSessionId}/submit`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          timeTakenSeconds: 320,
          answers: [],
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Exam session has already been submitted");
    });

    it("verifies negative marking floor at 0.0 when penalties exceed correct answers", async () => {
      // Start another session for other user
      const startRes = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .send({
          examSession: testSessionName,
          questionCount: 5,
          durationMinutes: 15,
        });

      expect(startRes.status).toBe(201);
      const otherSessionId = startRes.body.data.id;
      const otherQuestions = startRes.body.data.questions;

      // Submit all 5 questions as wrong answers -> 0 - 5*0.5 = -2.5 -> floor at 0.0
      const allWrongAnswers = otherQuestions.map((q: any) => ({
        questionId: q.id,
        selectedOption: Option.D,
      }));

      const submitRes = await request(app)
        .post(`/api/v1/exam/sessions/${otherSessionId}/submit`)
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .send({
          timeTakenSeconds: 150,
          answers: allWrongAnswers,
        });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.correctCount).toBe(0);
      expect(submitRes.body.data.incorrectCount).toBe(5);
      expect(submitRes.body.data.score).toBe(0.0);
    });
  });

  describe("GET /api/v1/leaderboard/:examSession & GET /api/v1/exam/leaderboard/:examSession", () => {
    it("returns leaderboard ranked by score DESC then timeTakenSeconds ASC", async () => {
      // Student 1 scored 1.0 in 300s
      // Student 2 scored 0.0 in 150s
      const res = await request(app)
        .get(`/api/v1/leaderboard/${encodeURIComponent(testSessionName)}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const student1Entry = res.body.data.find(
        (e: any) => e.userId === userId
      );
      const student2Entry = res.body.data.find(
        (e: any) => e.userId === otherUserId
      );

      expect(student1Entry).toBeDefined();
      expect(student2Entry).toBeDefined();
      expect(student1Entry.rank).toBeLessThan(student2Entry.rank);
      expect(student1Entry.score).toBeGreaterThanOrEqual(student2Entry.score);

      // Verify alias route /api/v1/exam/leaderboard/:examSession
      const aliasRes = await request(app)
        .get(`/api/v1/exam/leaderboard/${encodeURIComponent(testSessionName)}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(aliasRes.status).toBe(200);
      expect(aliasRes.body.data).toEqual(res.body.data);
    });
  });

  describe("Live Model Test Attempt Tracking & Session Resume Engine (TICKET-FUNC-008)", () => {
    let liveModelTestId = "";

    beforeAll(async () => {
      const now = new Date();
      const fifteenDaysLater = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      const liveTest = await prisma.modelTest.create({
        data: {
          title: `Integration Test 15-Day Live Model Test ${Date.now()}`,
          examSession: "47th BCS Preliminary",
          durationMinutes: 120,
          totalMarks: 200.0,
          totalQuestions: 200,
          startTime: now,
          endTime: fifteenDaysLater,
          isPublished: true,
        },
      });

      liveModelTestId = liveTest.id;
      createdModelTestIds.push(liveModelTestId);
    });

    it("rejects starting a session for non-existent modelTestId with 404 Not Found", async () => {
      const nonExistentUuid = "00000000-0000-0000-0000-000000000000";
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ modelTestId: nonExistentUuid });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Model test not found");
    });

    let activeSessionId = "";
    let firstQuestionsCount = 0;

    it("starts a new live model test session with 120min duration and questions matching syllabus", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ modelTestId: liveModelTestId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.modelTestId).toBe(liveModelTestId);
      expect(res.body.data.durationMinutes).toBe(120);
      expect(res.body.data.remainingSeconds).toBeGreaterThan(0);
      expect(res.body.data.questions.length).toBeGreaterThan(0);

      activeSessionId = res.body.data.id;
      firstQuestionsCount = res.body.data.questions.length;
    });

    it("resumes an existing active attempt with remaining time and existing questions", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ modelTestId: liveModelTestId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // Must be the exact same attempt session
      expect(res.body.data.id).toBe(activeSessionId);
      expect(res.body.data.modelTestId).toBe(liveModelTestId);
      expect(res.body.data.totalQuestions).toBe(firstQuestionsCount);
      expect(res.body.data.remainingSeconds).toBeLessThanOrEqual(120 * 60);
      expect(res.body.data.remainingSeconds).toBeGreaterThan(0);
    });

    it("auto-closes attempt and throws 409 Conflict if duration window has elapsed", async () => {
      // Simulate expired 120-minute timer by backdating startedAt to 130 minutes ago
      await prisma.examAttempt.update({
        where: { id: activeSessionId },
        data: {
          startedAt: new Date(Date.now() - 130 * 60 * 1000),
        },
      });

      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ modelTestId: liveModelTestId });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("পরীক্ষার নির্ধারিত সময় শেষ হয়েছে");

      // Verify attempt is finalized in DB
      const dbAttempt = await prisma.examAttempt.findUnique({
        where: { id: activeSessionId },
      });
      expect(dbAttempt?.finishedAt).not.toBeNull();
      expect(dbAttempt?.timeTakenSeconds).toBe(120 * 60);
    });

    it("blocks a completed candidate from retaking during the 15-day live window with 409 Conflict", async () => {
      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ modelTestId: liveModelTestId });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("আপনি ইতিমধ্যে এই লাইভ মডেল টেস্টটিতে অংশগ্রহণ করেছেন");
    });

    it("allows practice retake when model test window has EXPIRED (now > endTime)", async () => {
      // Mark model test as EXPIRED by moving endTime into past
      await prisma.modelTest.update({
        where: { id: liveModelTestId },
        data: {
          startTime: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() - 1000),
        },
      });

      const res = await request(app)
        .post("/api/v1/exam/sessions")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ modelTestId: liveModelTestId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).not.toBe(activeSessionId);
      expect(res.body.data.modelTestId).toBe(liveModelTestId);
    });
  });
});

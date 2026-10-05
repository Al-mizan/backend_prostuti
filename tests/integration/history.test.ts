import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { prisma } from "../../src/app/lib/prisma";
import {
  Difficulty,
  Option,
  QuestionType,
  SessionType,
  Subject,
} from "../../src/generated/prisma/enums";

describe("History Module Integration Tests", () => {
  const testEmail = `vitest_history_${Date.now()}@example.com`;
  const otherEmail = `vitest_other_history_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  let authToken = "";
  let otherAuthToken = "";
  let userId = "";
  let otherUserId = "";
  const createdQuestionIds: string[] = [];
  let practiceSessionId = "";
  let examSessionId = "";

  beforeAll(async () => {
    // 1. Create primary student
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "History Student",
      email: testEmail,
      password: testPassword,
    });
    expect(res.status).toBe(201);
    authToken = res.body.data.token;
    userId = res.body.data.userId;

    // 2. Create secondary student
    const otherRes = await request(app).post("/api/v1/auth/register").send({
      name: "Other History Student",
      email: otherEmail,
      password: testPassword,
    });
    expect(otherRes.status).toBe(201);
    otherAuthToken = otherRes.body.data.token;
    otherUserId = otherRes.body.data.userId;

    // 3. Seed questions for PRACTICE and BANK
    const practiceQ1 = await prisma.question.create({
      data: {
        type: QuestionType.PRACTICE,
        subject: Subject.ETHICS,
        questionText: "History Ethics Question 1: What is integrity?",
        optionA: "Honesty and strong moral principles",
        optionB: "Dishonesty",
        optionC: "Speed",
        optionD: "Power",
        correctOption: Option.A,
        explanation: "Integrity means honesty and strong moral principles.",
        difficulty: Difficulty.EASY,
        createdBy: userId,
      },
    });
    createdQuestionIds.push(practiceQ1.id);

    const practiceQ2 = await prisma.question.create({
      data: {
        type: QuestionType.PRACTICE,
        subject: Subject.ETHICS,
        questionText: "History Ethics Question 2: What is accountability?",
        optionA: "Responsibility for actions",
        optionB: "Avoiding blame",
        optionC: "Secret decisions",
        optionD: "Absolute power",
        correctOption: Option.A,
        explanation: "Accountability means being responsible for actions.",
        difficulty: Difficulty.MEDIUM,
        createdBy: userId,
      },
    });
    createdQuestionIds.push(practiceQ2.id);

    const bankQ1 = await prisma.question.create({
      data: {
        type: QuestionType.BANK,
        examSession: "44th BCS",
        subject: Subject.ENGLISH,
        questionText: "History English Question: Antonym of 'Gentle'?",
        optionA: "Rough",
        optionB: "Kind",
        optionC: "Soft",
        optionD: "Quiet",
        correctOption: Option.A,
        explanation: "Rough is the antonym of gentle.",
        difficulty: Difficulty.EASY,
        createdBy: userId,
      },
    });
    createdQuestionIds.push(bankQ1.id);

    // 4. Setup completed Practice session with 1 correct and 1 wrong answer
    const practiceSession = await prisma.practiceSession.create({
      data: {
        userId,
        subject: Subject.ETHICS,
        startedAt: new Date(Date.now() - 60000), // 1 min ago
        finishedAt: new Date(Date.now() - 30000),
        score: 1,
      },
    });
    practiceSessionId = practiceSession.id;

    await prisma.practiceSessionQuestion.createMany({
      data: [
        { sessionId: practiceSessionId, questionId: practiceQ1.id, orderIndex: 0 },
        { sessionId: practiceSessionId, questionId: practiceQ2.id, orderIndex: 1 },
      ],
    });

    // Practice Q1: correct
    await prisma.answer.create({
      data: {
        sessionType: SessionType.PRACTICE,
        sessionId: practiceSessionId,
        questionId: practiceQ1.id,
        selectedOption: Option.A,
        isCorrect: true,
      },
    });

    // Practice Q2: wrong (selected B, correct is A)
    await prisma.answer.create({
      data: {
        sessionType: SessionType.PRACTICE,
        sessionId: practiceSessionId,
        questionId: practiceQ2.id,
        selectedOption: Option.B,
        isCorrect: false,
      },
    });

    // 5. Setup completed Exam attempt with 1 wrong answer
    const examAttempt = await prisma.examAttempt.create({
      data: {
        userId,
        examSession: "44th BCS",
        startedAt: new Date(Date.now() - 120000), // 2 mins ago
        finishedAt: new Date(Date.now() - 90000),
        timeTakenSeconds: 30,
        score: 0,
      },
    });
    examSessionId = examAttempt.id;

    await prisma.examAttemptQuestion.create({
      data: {
        attemptId: examSessionId,
        questionId: bankQ1.id,
        orderIndex: 0,
      },
    });

    // Exam Bank Q1: wrong (selected C, correct is A)
    await prisma.answer.create({
      data: {
        sessionType: SessionType.EXAM,
        sessionId: examSessionId,
        questionId: bankQ1.id,
        selectedOption: Option.C,
        isCorrect: false,
      },
    });
  });

  afterAll(async () => {
    const userIds = [userId, otherUserId].filter(Boolean);
    if (userIds.length > 0) {
      const pSessions = await prisma.practiceSession.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const pIds = pSessions.map((p) => p.id);

      const eAttempts = await prisma.examAttempt.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const eIds = eAttempts.map((e) => e.id);

      const allSessionIds = [...pIds, ...eIds];
      if (allSessionIds.length > 0) {
        await prisma.answer.deleteMany({
          where: { sessionId: { in: allSessionIds } },
        });
      }
      if (pIds.length > 0) {
        await prisma.practiceSessionQuestion.deleteMany({
          where: { sessionId: { in: pIds } },
        });
        await prisma.practiceSession.deleteMany({
          where: { id: { in: pIds } },
        });
      }
      if (eIds.length > 0) {
        await prisma.examAttemptQuestion.deleteMany({
          where: { attemptId: { in: eIds } },
        });
        await prisma.examAttempt.deleteMany({
          where: { id: { in: eIds } },
        });
      }
    }

    if (createdQuestionIds.length > 0) {
      await prisma.answer.deleteMany({
        where: { questionId: { in: createdQuestionIds } },
      });
      await prisma.practiceSessionQuestion.deleteMany({
        where: { questionId: { in: createdQuestionIds } },
      });
      await prisma.examAttemptQuestion.deleteMany({
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
  });

  describe("GET /api/v1/history/attempts", () => {
    it("returns 401 Unauthorized when unauthenticated", async () => {
      const res = await request(app).get("/api/v1/history/attempts");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns completed practice and exam attempts ordered descending by startedAt", async () => {
      const res = await request(app)
        .get("/api/v1/history/attempts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Attempts history retrieved successfully");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      // Verify practice attempt
      const practiceItem = res.body.data.find(
        (item: any) => item.id === practiceSessionId
      );
      expect(practiceItem).toBeDefined();
      expect(practiceItem.sessionType).toBe("PRACTICE");
      expect(practiceItem.title).toBe("নৈতিকতা, মূল্যবোধ ও সুশাসন");
      expect(practiceItem.subject).toBe("ETHICS");
      expect(practiceItem.totalQuestions).toBe(2);
      expect(practiceItem.score).toBe(1);

      // Verify exam attempt
      const examItem = res.body.data.find(
        (item: any) => item.id === examSessionId
      );
      expect(examItem).toBeDefined();
      expect(examItem.sessionType).toBe("EXAM");
      expect(examItem.title).toBe("44th BCS");
      expect(examItem.examSession).toBe("44th BCS");
      expect(examItem.totalQuestions).toBe(1);
      expect(examItem.timeTakenSeconds).toBe(30);

      // Verify descending order
      for (let i = 0; i < res.body.data.length - 1; i++) {
        const curr = new Date(res.body.data[i].startedAt).getTime();
        const next = new Date(res.body.data[i + 1].startedAt).getTime();
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });

    it("returns empty attempts list for a user with no finished sessions", async () => {
      const res = await request(app)
        .get("/api/v1/history/attempts")
        .set("Authorization", `Bearer ${otherAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("GET /api/v1/history/wrong-answers", () => {
    it("returns wrong answers derived across user practice and exam sessions", async () => {
      const res = await request(app)
        .get("/api/v1/history/wrong-answers")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Wrong answers retrieved successfully");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2); // 1 from practice, 1 from exam

      const ethicsWrong = res.body.data.find((w: any) => w.subject === "ETHICS");
      expect(ethicsWrong).toBeDefined();
      expect(ethicsWrong.sessionType).toBe("PRACTICE");
      expect(ethicsWrong.selectedOption).toBe("B");
      expect(ethicsWrong.correctOption).toBe("A");
      expect(ethicsWrong.explanation).toContain("Accountability means being responsible for actions");

      const englishWrong = res.body.data.find(
        (w: any) => w.subject === "ENGLISH"
      );
      expect(englishWrong).toBeDefined();
      expect(englishWrong.sessionType).toBe("EXAM");
      expect(englishWrong.selectedOption).toBe("C");
      expect(englishWrong.correctOption).toBe("A");
      expect(englishWrong.explanation).toContain("Rough is the antonym of gentle");
    });

    it("filters wrong answers by subject query parameter", async () => {
      const res = await request(app)
        .get("/api/v1/history/wrong-answers?subject=ETHICS")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].subject).toBe("ETHICS");
      expect(res.body.data[0].selectedOption).toBe("B");
    });

    it("returns empty wrong answers for another user without wrong answers", async () => {
      const res = await request(app)
        .get("/api/v1/history/wrong-answers")
        .set("Authorization", `Bearer ${otherAuthToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app";
import { prisma } from "../../src/app/lib/prisma";
import { Difficulty, Option, QuestionType, Subject } from "../../src/generated/prisma/enums";

describe("Question Bank Module Integration Tests", () => {
  const testEmail = `vitest_qbank_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  let authToken = "";
  let userId = "";
  let testQuestionId = "";

  beforeAll(async () => {
    // Register test student
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "QBank Student",
        email: testEmail,
        password: testPassword,
      });

    expect(res.status).toBe(201);
    authToken = res.body.data.token;
    userId = res.body.data.userId;

    // Create a BANK question for testing
    const question = await prisma.question.create({
      data: {
        type: QuestionType.BANK,
        subject: Subject.BENGALI,
        examSession: "47th BCS Preli",
        topic: "Bengali Literature",
        questionText: "Which poem is written by Kazi Nazrul Islam?",
        optionA: "Bidrohi",
        optionB: "Sonar Tori",
        optionC: "Banalata Sen",
        optionD: "Rupashi Bangla",
        correctOption: Option.A,
        explanation: "Bidrohi is a famous poem by Kazi Nazrul Islam published in 1922.",
        difficulty: Difficulty.MEDIUM,
        createdBy: userId,
      },
    });

    testQuestionId = question.id;
  });

  afterAll(async () => {
    if (testQuestionId) {
      await prisma.question.deleteMany({
        where: { id: testQuestionId },
      });
    }
    if (userId) {
      await prisma.user.deleteMany({
        where: { id: userId },
      });
    }
  });

  describe("GET /api/v1/question-bank/sessions", () => {
    it("returns 401 Unauthorized when no token is provided", async () => {
      const res = await request(app).get("/api/v1/question-bank/sessions");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 200 OK with list of BCS sessions sorted descending", async () => {
      const res = await request(app)
        .get("/api/v1/question-bank/sessions")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("BCS sessions fetched successfully");
      expect(Array.isArray(res.body.data)).toBe(true);

      const sessions = res.body.data;
      expect(sessions.length).toBeGreaterThanOrEqual(41); // 50 down to 10 is 41 editions

      // First session should be 50th BCS
      expect(sessions[0].sessionName).toBe("50th BCS Preli");

      // Verify special naming for 49th and 48th
      const s49 = sessions.find((s: any) => s.sessionName.includes("49th"));
      expect(s49).toBeDefined();
      expect(s49.sessionName).toBe("49th BCS(General) Preli");
      expect(s49.durationMinutes).toBe(60);
      expect(s49.totalMarks).toBe(100.0);

      const s48 = sessions.find((s: any) => s.sessionName.includes("48th"));
      expect(s48).toBeDefined();
      expect(s48.sessionName).toBe("48th BCS(Special) Preli");
      expect(s48.durationMinutes).toBe(120);
      expect(s48.totalMarks).toBe(200.0);

      // Verify 37th has count 197 or default 198
      const s37 = sessions.find((s: any) => s.sessionName.includes("37th"));
      expect(s37).toBeDefined();
      expect([197, 198]).toContain(s37.totalQuestions);

      // Verify short sessions have 60 mins and 100 marks
      const s42 = sessions.find((s: any) => s.sessionName.includes("42th"));
      expect(s42).toBeDefined();
      expect(s42.durationMinutes).toBe(60);
      expect(s42.totalMarks).toBe(100.0);

      const s33 = sessions.find((s: any) => s.sessionName.includes("33th"));
      expect(s33).toBeDefined();
      expect(s33.durationMinutes).toBe(60);
      expect(s33.totalMarks).toBe(100.0);

      const s30 = sessions.find((s: any) => s.sessionName.includes("30th"));
      expect(s30).toBeDefined();
      expect(s30.durationMinutes).toBe(60);
      expect(s30.totalMarks).toBe(100.0);

      // Verify standard session
      const s45 = sessions.find((s: any) => s.sessionName.includes("45th"));
      expect(s45).toBeDefined();
      expect(s45.durationMinutes).toBe(120);
      expect(s45.totalMarks).toBe(200.0);

      // Verify negative marking is 0.5
      expect(sessions[0].negativeMarkingPerQuestion).toBe(0.5);

      // Verify descending sort order
      for (let i = 0; i < sessions.length - 1; i++) {
        const numA = parseInt(sessions[i].sessionName.match(/\d+/)?.[0] || "0", 10);
        const numB = parseInt(sessions[i + 1].sessionName.match(/\d+/)?.[0] || "0", 10);
        expect(numA).toBeGreaterThanOrEqual(numB);
      }
    });
  });

  describe("GET /api/v1/question-bank", () => {
    it("returns 401 Unauthorized when no token is provided", async () => {
      const res = await request(app).get("/api/v1/question-bank");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 200 OK with paginated questions list and standard envelope", async () => {
      const res = await request(app)
        .get("/api/v1/question-bank")
        .query({ examSession: "47th BCS Preli" })
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Questions fetched successfully");
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("meta");

      const { data, meta } = res.body;
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.page).toBe(0);
      expect(data.pageSize).toBe(20);
      expect(meta.page).toBe(0);
      expect(meta.limit).toBe(20);

      const found = data.items.find((item: any) => item.id === testQuestionId);
      expect(found).toBeDefined();
      expect(found.subject).toBe("BENGALI");
      expect(found.examSession).toBe("47th BCS Preli");
      expect(found.questionText).toBe("Which poem is written by Kazi Nazrul Islam?");
      expect(found.correctOption).toBe("A");
      expect(found.explanation).toContain("Bidrohi");
    });

    it("filters questions by subject correctly", async () => {
      // Query BENGALI -> should find our question
      const resBengali = await request(app)
        .get("/api/v1/question-bank")
        .query({ examSession: "47th BCS Preli", subject: "BENGALI" })
        .set("Authorization", `Bearer ${authToken}`);

      expect(resBengali.status).toBe(200);
      const foundInBengali = resBengali.body.data.items.some((i: any) => i.id === testQuestionId);
      expect(foundInBengali).toBe(true);

      // Query MATH -> should NOT find our question
      const resMath = await request(app)
        .get("/api/v1/question-bank")
        .query({ examSession: "47th BCS Preli", subject: "MATH" })
        .set("Authorization", `Bearer ${authToken}`);

      expect(resMath.status).toBe(200);
      const foundInMath = resMath.body.data.items.some((i: any) => i.id === testQuestionId);
      expect(foundInMath).toBe(false);
    });

    it("rejects invalid subject query parameter with 400 validation error", async () => {
      const res = await request(app)
        .get("/api/v1/question-bank")
        .query({ subject: "INVALID_SUBJECT" })
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation Error");
    });

    it("returns subject questions across all BCS exams when examSession is omitted (regression test)", async () => {
      const res = await request(app)
        .get("/api/v1/question-bank")
        .query({ subject: "BENGALI" })
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.every((i: any) => i.subject === "BENGALI")).toBe(true);
    });

    it("returns subject questions across all BCS exams when examSession is ALL (regression test)", async () => {
      const res = await request(app)
        .get("/api/v1/question-bank")
        .query({ examSession: "ALL", subject: "BENGALI" })
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it("sets totalQuestions to 0 for unheld future sessions like 50th BCS (regression test)", async () => {
      const res = await request(app)
        .get("/api/v1/question-bank/sessions")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const s50 = res.body.data.find((s: any) => s.sessionName === "50th BCS Preli");
      expect(s50).toBeDefined();
      expect(s50.totalQuestions).toBe(0);
    });
  });
});

import { describe, it, expect } from "vitest";
import { Role, Subject, QuestionType, SessionType, Option, Difficulty } from "../src/generated/prisma/enums";

describe("Prisma Schema & Enums", () => {
  it("exports all required BCS domain enums", () => {
    expect(Role.STUDENT).toBe("STUDENT");
    expect(Role.ADMIN).toBe("ADMIN");

    expect(Subject.BENGALI).toBe("BENGALI");
    expect(Subject.ENGLISH).toBe("ENGLISH");
    expect(Subject.BD_INTERNATIONAL_AFFAIRS).toBe("BD_INTERNATIONAL_AFFAIRS");
    expect(Subject.GEOGRAPHY).toBe("GEOGRAPHY");
    expect(Subject.SCIENCE).toBe("SCIENCE");
    expect(Subject.IT).toBe("IT");
    expect(Subject.MATH).toBe("MATH");
    expect(Subject.MENTAL_ABILITY).toBe("MENTAL_ABILITY");
    expect(Subject.ETHICS).toBe("ETHICS");

    expect(QuestionType.BANK).toBe("BANK");
    expect(QuestionType.PRACTICE).toBe("PRACTICE");

    expect(SessionType.PRACTICE).toBe("PRACTICE");
    expect(SessionType.EXAM).toBe("EXAM");

    expect(Option.A).toBe("A");
    expect(Option.B).toBe("B");
    expect(Option.C).toBe("C");
    expect(Option.D).toBe("D");

    expect(Difficulty.EASY).toBe("EASY");
    expect(Difficulty.MEDIUM).toBe("MEDIUM");
    expect(Difficulty.HARD).toBe("HARD");
  });
});

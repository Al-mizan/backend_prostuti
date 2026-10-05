import httpStatus from "http-status";
import { QuestionType, SessionType } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import {
  BCS_NEGATIVE_MARKING_PENALTY,
  DEFAULT_EXAM_DURATION_MINUTES,
  DEFAULT_EXAM_QUESTION_COUNT,
  LEADERBOARD_LIMIT,
} from "./exam.constant";
import {
  IExamQuestionResultDto,
  IExamResultDto,
  IExamSessionDto,
  ILeaderboardEntryDto,
  IStartExamPayload,
  ISubmitExamPayload,
} from "./exam.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const startSession = async (
  userId: string,
  payload: IStartExamPayload
): Promise<IExamSessionDto> => {
  const count = payload.questionCount ?? DEFAULT_EXAM_QUESTION_COUNT;
  const durationMinutes =
    payload.durationMinutes ?? DEFAULT_EXAM_DURATION_MINUTES;
  const examSession = payload.examSession.trim();

  let candidateQuestions: any[] = [];
  let resolvedExamSession = examSession;

  if (examSession.toUpperCase() === "ALL") {
    candidateQuestions = await prisma.question.findMany({
      where: {
        type: QuestionType.BANK,
        isDeleted: false,
      },
    });
  } else {
    // 1. Exact match
    candidateQuestions = await prisma.question.findMany({
      where: {
        type: QuestionType.BANK,
        isDeleted: false,
        examSession,
      },
    });

    // 2. Case-insensitive exact match
    if (candidateQuestions.length === 0) {
      candidateQuestions = await prisma.question.findMany({
        where: {
          type: QuestionType.BANK,
          isDeleted: false,
          examSession: {
            equals: examSession,
            mode: "insensitive",
          },
        },
      });
    }

    // 3. Case-insensitive contains match (e.g. '47th BCS Preli' matches '47th BCS Preliminary')
    if (candidateQuestions.length === 0) {
      candidateQuestions = await prisma.question.findMany({
        where: {
          type: QuestionType.BANK,
          isDeleted: false,
          examSession: {
            contains: examSession,
            mode: "insensitive",
          },
        },
      });
    }

    // 4. Prefix / BCS number match (e.g. '47th BCS', '47th', '41st', etc.)
    if (candidateQuestions.length === 0) {
      const numberMatch = examSession.match(/\b(\d+)(?:st|nd|rd|th)?\b/i);
      if (numberMatch) {
        const editionNum = numberMatch[1];
        candidateQuestions = await prisma.question.findMany({
          where: {
            type: QuestionType.BANK,
            isDeleted: false,
            OR: [
              { examSession: { contains: `${editionNum}th`, mode: "insensitive" } },
              { examSession: { contains: `${editionNum}st`, mode: "insensitive" } },
              { examSession: { contains: `${editionNum}nd`, mode: "insensitive" } },
              { examSession: { contains: `${editionNum}rd`, mode: "insensitive" } },
              { examSession: { contains: editionNum, mode: "insensitive" } },
            ],
          },
        });
      }
    }

    if (candidateQuestions.length > 0 && candidateQuestions[0].examSession) {
      resolvedExamSession = candidateQuestions[0].examSession;
    }
  }

  if (candidateQuestions.length === 0) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      `No questions found for session: ${examSession}`
    );
  }

  // Shuffle candidate questions and take requested count
  const shuffled = [...candidateQuestions].sort(() => Math.random() - 0.5);
  const selectedQuestions = shuffled.slice(0, Math.min(count, shuffled.length));

  const now = new Date();

  const session = await prisma.$transaction(async (tx) => {
    const newAttempt = await tx.examAttempt.create({
      data: {
        userId,
        examSession: resolvedExamSession,
        startedAt: now,
      },
    });

    await tx.examAttemptQuestion.createMany({
      data: selectedQuestions.map((q, index) => ({
        attemptId: newAttempt.id,
        questionId: q.id,
        orderIndex: index,
      })),
    });

    return newAttempt;
  });

  return {
    id: session.id,
    examSession: session.examSession,
    totalQuestions: selectedQuestions.length,
    durationMinutes,
    questions: selectedQuestions.map((q) => ({
      id: q.id,
      subject: q.subject,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      topic: q.topic,
      difficulty: q.difficulty,
    })),
    startedAt: now.toISOString(),
  };
};

const submitExam = async (
  userId: string,
  sessionId: string,
  payload: ISubmitExamPayload
): Promise<IExamResultDto> => {
  if (!UUID_REGEX.test(sessionId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Exam session not found");
  }

  return await prisma.$transaction(async (tx) => {
    const attempt = await tx.examAttempt.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!attempt) {
      throw new AppError(httpStatus.NOT_FOUND, "Exam session not found");
    }

    if (attempt.finishedAt !== null) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Exam session has already been submitted"
      );
    }

    const attemptQuestions = await tx.examAttemptQuestion.findMany({
      where: {
        attemptId: sessionId,
      },
      include: {
        question: true,
      },
      orderBy: {
        orderIndex: "asc",
      },
    });

    if (attemptQuestions.length === 0) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "No questions found for this exam session"
      );
    }

    const answersMap = new Map<string, string | null>();
    for (const a of payload.answers) {
      answersMap.set(a.questionId, a.selectedOption ?? null);
    }

    const now = new Date();
    const questionResults: IExamQuestionResultDto[] = [];
    const answersToInsert: Array<{
      sessionType: SessionType;
      sessionId: string;
      questionId: string;
      selectedOption: any;
      isCorrect: boolean;
      answeredAt: Date;
    }> = [];

    for (const aq of attemptQuestions) {
      const q = aq.question;
      const selectedOption = (answersMap.get(q.id) as any) ?? null;
      const isCorrect =
        selectedOption !== null && selectedOption === q.correctOption;

      if (selectedOption !== null) {
        answersToInsert.push({
          sessionType: SessionType.EXAM,
          sessionId,
          questionId: q.id,
          selectedOption,
          isCorrect,
          answeredAt: now,
        });
      }

      questionResults.push({
        questionId: q.id,
        subject: q.subject,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        selectedOption,
        correctOption: q.correctOption,
        isCorrect,
        explanation: q.explanation,
        topic: q.topic,
      });
    }

    if (answersToInsert.length > 0) {
      await tx.answer.createMany({
        data: answersToInsert,
      });
    }

    const totalQuestions = questionResults.length;
    const correctCount = questionResults.filter((q) => q.isCorrect).length;
    const incorrectCount = questionResults.filter(
      (q) => q.selectedOption !== null && !q.isCorrect
    ).length;
    const skippedCount = questionResults.filter(
      (q) => q.selectedOption === null
    ).length;

    // BCS preliminary negative marking rule: +1.0 per correct, -0.5 per wrong
    const netScore = Math.max(
      0.0,
      correctCount - incorrectCount * BCS_NEGATIVE_MARKING_PENALTY
    );
    const integerScore = Math.round(netScore);

    await tx.examAttempt.update({
      where: { id: sessionId },
      data: {
        finishedAt: now,
        timeTakenSeconds: payload.timeTakenSeconds,
        score: integerScore,
      },
    });

    return {
      sessionId: attempt.id,
      examSession: attempt.examSession,
      totalQuestions,
      correctCount,
      incorrectCount,
      skippedCount,
      score: netScore,
      timeTakenSeconds: payload.timeTakenSeconds,
      questions: questionResults,
    };
  });
};

const getLeaderboard = async (
  examSession?: string
): Promise<ILeaderboardEntryDto[]> => {
  const whereClause: {
    finishedAt: { not: null };
    examSession?: string;
  } = {
    finishedAt: { not: null },
  };

  if (
    examSession &&
    examSession.trim() !== "" &&
    examSession.trim().toUpperCase() !== "ALL"
  ) {
    whereClause.examSession = examSession.trim();
  }

  const attempts = await prisma.examAttempt.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarId: true,
        },
      },
    },
    orderBy: [{ score: "desc" }, { timeTakenSeconds: "asc" }],
    take: LEADERBOARD_LIMIT,
  });

  return attempts.map((attempt, index) => ({
    rank: index + 1,
    userId: attempt.userId,
    userName: attempt.user.name,
    avatarId: attempt.user.avatarId,
    score: attempt.score ?? 0,
    timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
    finishedAt: attempt.finishedAt?.toISOString() ?? "",
  }));
};

export const ExamService = {
  startSession,
  submitExam,
  getLeaderboard,
};

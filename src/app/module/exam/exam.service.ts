import httpStatus from "http-status";
import { QuestionType, SessionType, Subject } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import {
  BCS_NEGATIVE_MARKING_PENALTY,
  BCS_SYLLABUS_DISTRIBUTION,
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
  const now = new Date();

  // 1. Model Test attempt tracking and resume engine
  if (payload.modelTestId) {
    if (!UUID_REGEX.test(payload.modelTestId)) {
      throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
    }

    const modelTest = await prisma.modelTest.findUnique({
      where: { id: payload.modelTestId },
    });

    if (!modelTest) {
      throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
    }

    const existingAttempt = await prisma.examAttempt.findFirst({
      where: {
        userId,
        modelTestId: modelTest.id,
      },
      orderBy: {
        startedAt: "desc",
      },
      include: {
        examAttemptQuestions: {
          include: {
            question: true,
          },
          orderBy: {
            orderIndex: "asc",
          },
        },
      },
    });

    if (existingAttempt) {
      if (existingAttempt.finishedAt !== null) {
        // If modelTest is LIVE (now <= endTime), candidate already participated
        if (now <= modelTest.endTime) {
          throw new AppError(
            httpStatus.CONFLICT,
            "আপনি ইতিমধ্যে এই লাইভ মডেল টেস্টটিতে অংশগ্রহণ করেছেন"
          );
        }
        // If EXPIRED (now > endTime), allow new practice attempt (proceeds to create new attempt below)
      } else {
        // Active in-progress attempt (finishedAt === null)
        const elapsedSeconds = Math.floor(
          (now.getTime() - existingAttempt.startedAt.getTime()) / 1000
        );
        const totalDurationSeconds = modelTest.durationMinutes * 60;

        if (elapsedSeconds < totalDurationSeconds) {
          // RESUME ATTEMPT: Return existing session with questions from exam_attempt_questions, and adjusted remaining duration
          const remainingSeconds = totalDurationSeconds - elapsedSeconds;
          const adjustedDurationMinutes = Math.max(
            1,
            Math.ceil(remainingSeconds / 60)
          );

          return {
            id: existingAttempt.id,
            examSession: existingAttempt.examSession,
            totalQuestions: existingAttempt.examAttemptQuestions.length,
            durationMinutes: adjustedDurationMinutes,
            remainingSeconds,
            modelTestId: existingAttempt.modelTestId,
            questions: existingAttempt.examAttemptQuestions.map((aq) => ({
              id: aq.question.id,
              subject: aq.question.subject,
              questionText: aq.question.questionText,
              optionA: aq.question.optionA,
              optionB: aq.question.optionB,
              optionC: aq.question.optionC,
              optionD: aq.question.optionD,
              topic: aq.question.topic,
              difficulty: aq.question.difficulty,
            })),
            startedAt: existingAttempt.startedAt.toISOString(),
          };
        } else {
          // Expired time window: auto-close and throw CONFLICT
          const answers = await prisma.answer.findMany({
            where: {
              sessionId: existingAttempt.id,
              sessionType: SessionType.EXAM,
            },
          });

          let finalScore = 0;
          if (answers.length > 0) {
            const correct = answers.filter((a) => a.isCorrect).length;
            const incorrect = answers.length - correct;
            const net = Math.max(
              0,
              correct - incorrect * BCS_NEGATIVE_MARKING_PENALTY
            );
            finalScore = Math.round(net);
          }

          await prisma.examAttempt.update({
            where: { id: existingAttempt.id },
            data: {
              finishedAt: now,
              timeTakenSeconds: totalDurationSeconds,
              score: finalScore,
            },
          });

          throw new AppError(
            httpStatus.CONFLICT,
            "পরীক্ষার নির্ধারিত সময় শেষ হয়েছে"
          );
        }
      }
    }

    // Create new ExamAttempt with modelTestId and questions matching BCS syllabus
    const targetQuestionCount =
      payload.questionCount ?? modelTest.totalQuestions;
    const durationMinutes =
      payload.durationMinutes ?? modelTest.durationMinutes;

    let candidateQuestions: any[] = [];
    const selectedIds = new Set<string>();

    for (const [subjectKey, requiredCount] of Object.entries(
      BCS_SYLLABUS_DISTRIBUTION
    )) {
      const subject = subjectKey as Subject;
      const questionsForSubject = await prisma.question.findMany({
        where: {
          type: QuestionType.BANK,
          isDeleted: false,
          subject,
        },
      });

      const shuffledSubj = [...questionsForSubject].sort(
        () => Math.random() - 0.5
      );
      const picked = shuffledSubj.slice(0, requiredCount);
      for (const q of picked) {
        candidateQuestions.push(q);
        selectedIds.add(q.id);
      }
    }

    // If total picked is less than target, top up from remaining bank questions
    if (candidateQuestions.length < targetQuestionCount) {
      const remainingNeeded = targetQuestionCount - candidateQuestions.length;
      const extraQuestions = await prisma.question.findMany({
        where: {
          type: QuestionType.BANK,
          isDeleted: false,
          id: { notIn: Array.from(selectedIds) },
        },
        take: remainingNeeded,
      });
      for (const eq of extraQuestions) {
        candidateQuestions.push(eq);
        selectedIds.add(eq.id);
      }
    }

    // Fallback if syllabus queries yielded nothing
    if (candidateQuestions.length === 0) {
      candidateQuestions = await prisma.question.findMany({
        where: {
          type: QuestionType.BANK,
          isDeleted: false,
        },
        take: targetQuestionCount,
      });
    }

    if (candidateQuestions.length === 0) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        `No questions found for model test: ${modelTest.title}`
      );
    }

    const shuffledFinal = [...candidateQuestions].sort(
      () => Math.random() - 0.5
    );
    const selectedQuestions = shuffledFinal.slice(
      0,
      Math.min(targetQuestionCount, shuffledFinal.length)
    );

    const session = await prisma.$transaction(async (tx) => {
      const newAttempt = await tx.examAttempt.create({
        data: {
          userId,
          modelTestId: modelTest.id,
          examSession: modelTest.examSession,
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
      remainingSeconds: durationMinutes * 60,
      modelTestId: modelTest.id,
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
  }

  // 2. Standard exam session by examSession name
  const count = payload.questionCount ?? DEFAULT_EXAM_QUESTION_COUNT;
  const durationMinutes =
    payload.durationMinutes ?? DEFAULT_EXAM_DURATION_MINUTES;
  const examSession = (payload.examSession ?? "").trim();

  if (!examSession) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Either examSession or modelTestId must be provided"
    );
  }

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
    remainingSeconds: durationMinutes * 60,
    modelTestId: null,
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

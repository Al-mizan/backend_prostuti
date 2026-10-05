import { SessionType, Subject } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { MAX_WRONG_ANSWERS_LIMIT, SUBJECT_BANGLA_NAMES } from "./history.constant";
import {
  IUserAttemptSummaryDto,
  IWrongAnswerItemDto,
} from "./history.interface";

const getAttempts = async (
  userId: string
): Promise<IUserAttemptSummaryDto[]> => {
  const practiceSessions = await prisma.practiceSession.findMany({
    where: {
      userId,
      finishedAt: { not: null },
    },
    include: {
      _count: {
        select: { practiceSessionQuestions: true },
      },
    },
  });

  const examAttempts = await prisma.examAttempt.findMany({
    where: {
      userId,
      finishedAt: { not: null },
    },
    include: {
      _count: {
        select: { examAttemptQuestions: true },
      },
    },
  });

  const practiceDtos: IUserAttemptSummaryDto[] = practiceSessions.map((s) => ({
    id: s.id,
    sessionType: SessionType.PRACTICE,
    title: SUBJECT_BANGLA_NAMES[s.subject] || s.subject,
    subject: s.subject,
    examSession: null,
    score: s.score ?? 0,
    totalQuestions: s._count.practiceSessionQuestions,
    timeTakenSeconds: null,
    startedAt: s.startedAt ? s.startedAt.toISOString() : "",
    finishedAt: s.finishedAt?.toISOString() ?? null,
  }));

  const examDtos: IUserAttemptSummaryDto[] = examAttempts.map((a) => ({
    id: a.id,
    sessionType: SessionType.EXAM,
    title: a.examSession,
    subject: null,
    examSession: a.examSession,
    score: a.score ?? 0,
    totalQuestions: a._count.examAttemptQuestions,
    timeTakenSeconds: a.timeTakenSeconds,
    startedAt: a.startedAt.toISOString(),
    finishedAt: a.finishedAt?.toISOString() ?? null,
  }));

  const combined = [...practiceDtos, ...examDtos];
  combined.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return combined;
};

const getWrongAnswers = async (
  userId: string,
  subject?: Subject
): Promise<IWrongAnswerItemDto[]> => {
  const userPractice = await prisma.practiceSession.findMany({
    where: { userId },
    select: { id: true },
  });

  const userExams = await prisma.examAttempt.findMany({
    where: { userId },
    select: { id: true },
  });

  const allSessionIds = [
    ...userPractice.map((p) => p.id),
    ...userExams.map((e) => e.id),
  ];

  if (allSessionIds.length === 0) {
    return [];
  }

  const answers = await prisma.answer.findMany({
    where: {
      isCorrect: false,
      sessionId: { in: allSessionIds },
      ...(subject ? { question: { subject } } : {}),
    },
    include: {
      question: true,
    },
    orderBy: {
      answeredAt: "desc",
    },
    take: MAX_WRONG_ANSWERS_LIMIT,
  });

  return answers.map((row) => ({
    answerId: row.id,
    sessionId: row.sessionId,
    sessionType: row.sessionType,
    questionId: row.questionId,
    subject: row.question.subject,
    topic: row.question.topic,
    questionText: row.question.questionText,
    optionA: row.question.optionA,
    optionB: row.question.optionB,
    optionC: row.question.optionC,
    optionD: row.question.optionD,
    selectedOption: row.selectedOption,
    correctOption: row.question.correctOption,
    explanation: row.question.explanation,
    answeredAt: row.answeredAt.toISOString(),
  }));
};

export const HistoryService = {
  getAttempts,
  getWrongAnswers,
};

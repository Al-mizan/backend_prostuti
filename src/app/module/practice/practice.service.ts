import httpStatus from "http-status";
import { QuestionType, SessionType } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import {
  IFinishPracticeSessionResponse,
  IPracticeAnswerResultDto,
  IPracticeSessionDto,
  IStartPracticePayload,
  ISubmitAnswerPayload,
} from "./practice.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const startSession = async (
  userId: string,
  payload: IStartPracticePayload
): Promise<IPracticeSessionDto> => {
  const count = payload.count ?? 10;
  const subject = payload.subject;

  let candidateQuestions = await prisma.question.findMany({
    where: {
      type: QuestionType.BANK,
      subject,
      isDeleted: false,
    },
    take: count * 4,
  });

  // Fallback to any available questions for subject (e.g. seeded PRACTICE questions)
  if (candidateQuestions.length === 0) {
    candidateQuestions = await prisma.question.findMany({
      where: {
        subject,
        isDeleted: false,
      },
      take: count * 4,
    });
  }

  if (candidateQuestions.length === 0) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      `No questions available for subject: ${subject}`
    );
  }

  // Shuffle candidate questions and pick requested count
  const shuffled = [...candidateQuestions].sort(() => Math.random() - 0.5);
  const selectedQuestions = shuffled.slice(0, Math.min(count, shuffled.length));

  const now = new Date();

  const session = await prisma.$transaction(async (tx) => {
    const newSession = await tx.practiceSession.create({
      data: {
        userId,
        subject,
        startedAt: now,
      },
    });

    await tx.practiceSessionQuestion.createMany({
      data: selectedQuestions.map((q, index) => ({
        sessionId: newSession.id,
        questionId: q.id,
        orderIndex: index,
      })),
    });

    return newSession;
  });

  return {
    id: session.id,
    subject: session.subject,
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
      examSession: q.examSession,
    })),
    startedAt: now.toISOString(),
  };
};

const submitAnswer = async (
  userId: string,
  sessionId: string,
  payload: ISubmitAnswerPayload
): Promise<IPracticeAnswerResultDto> => {
  if (!UUID_REGEX.test(sessionId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Practice session not found");
  }

  const session = await prisma.practiceSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
  });

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Practice session not found");
  }

  if (session.finishedAt !== null) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Practice session is already finished"
    );
  }

  const question = await prisma.question.findFirst({
    where: {
      id: payload.questionId,
      isDeleted: false,
    },
  });

  if (!question) {
    throw new AppError(httpStatus.NOT_FOUND, "Question not found");
  }

  const isCorrect = payload.selectedOption === question.correctOption;
  const now = new Date();

  await prisma.answer.create({
    data: {
      sessionType: SessionType.PRACTICE,
      sessionId,
      questionId: payload.questionId,
      selectedOption: payload.selectedOption,
      isCorrect,
      answeredAt: now,
    },
  });

  return {
    questionId: payload.questionId,
    selectedOption: payload.selectedOption,
    isCorrect,
    correctOption: question.correctOption,
    explanation: question.explanation,
  };
};

const finishSession = async (
  userId: string,
  sessionId: string
): Promise<IFinishPracticeSessionResponse> => {
  if (!UUID_REGEX.test(sessionId)) {
    throw new AppError(httpStatus.NOT_FOUND, "Practice session not found");
  }

  const session = await prisma.practiceSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
  });

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Practice session not found");
  }

  const totalQuestions = await prisma.practiceSessionQuestion.count({
    where: { sessionId },
  });

  const answers = await prisma.answer.findMany({
    where: {
      sessionId,
      sessionType: SessionType.PRACTICE,
    },
  });

  const correctCount = answers.filter((a) => a.isCorrect).length;
  const incorrectCount = answers.filter((a) => !a.isCorrect).length;
  const score = correctCount;
  const now = new Date();

  await prisma.practiceSession.update({
    where: { id: sessionId },
    data: {
      score,
      finishedAt: now,
    },
  });

  return {
    sessionId: session.id,
    subject: session.subject,
    totalQuestions,
    correctCount,
    incorrectCount,
    score,
  };
};

export const PracticeService = {
  startSession,
  submitAnswer,
  finishSession,
};

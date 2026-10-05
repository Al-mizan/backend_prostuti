import { Prisma } from "../../../generated/prisma/client";
import { QuestionType } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import {
  IBcsSessionSummaryDto,
  IQuestionBankItemDto,
  IQuestionBankPageResponse,
  IQuestionBankQuery,
} from "./questionBank.interface";

const listSessions = async (): Promise<IBcsSessionSummaryDto[]> => {
  const grouped = await prisma.question.groupBy({
    by: ["examSession"],
    where: {
      type: QuestionType.BANK,
      isDeleted: false,
      examSession: {
        not: null,
      },
    },
    _count: {
      id: true,
    },
  });

  const dbCounts = new Map<string, number>();
  for (const row of grouped) {
    if (row.examSession) {
      dbCounts.set(row.examSession, row._count.id);
    }
  }

  const shortEditions = new Set([49, 42, 33]);
  const defaultArchive: IBcsSessionSummaryDto[] = [];

  for (let edition = 50; edition >= 10; edition--) {
    const isShort = shortEditions.has(edition) || edition <= 34;
    let sessionName: string;
    if (edition === 49) {
      sessionName = "49th BCS(General) Preli";
    } else if (edition === 48) {
      sessionName = "48th BCS(Special) Preli";
    } else {
      sessionName = `${edition}th BCS Preli`;
    }

    const defaultCount = edition === 37 ? 198 : isShort ? 100 : 200;
    const durationMinutes = isShort ? 60 : 120;
    const totalMarks = isShort ? 100.0 : 200.0;

    let count = defaultCount;
    for (const [key, value] of dbCounts.entries()) {
      if (key.includes(`${edition}th`) || key === sessionName) {
        count = value;
        break;
      }
    }

    defaultArchive.push({
      sessionName,
      totalQuestions: count,
      durationMinutes,
      totalMarks,
      negativeMarkingPerQuestion: 0.5,
    });
  }

  const customDbSessions: IBcsSessionSummaryDto[] = [];
  for (const [name, count] of dbCounts.entries()) {
    const matchesDefault = defaultArchive.some(
      (d) => d.sessionName === name || /\b\d+th\b/.test(name)
    );
    if (!matchesDefault) {
      customDbSessions.push({
        sessionName: name,
        totalQuestions: count,
        durationMinutes: 120,
        totalMarks: 200.0,
        negativeMarkingPerQuestion: 0.5,
      });
    }
  }

  const extractNumber = (name: string): number => {
    const match = name.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  return [...customDbSessions, ...defaultArchive].sort((a, b) => {
    const numA = extractNumber(a.sessionName);
    const numB = extractNumber(b.sessionName);
    if (numB !== numA) {
      return numB - numA;
    }
    return b.sessionName.localeCompare(a.sessionName);
  });
};

const listQuestions = async (
  query: IQuestionBankQuery
): Promise<IQuestionBankPageResponse> => {
  let examSession = query.examSession?.trim();

  if (!examSession) {
    const sessions = await listSessions();
    if (sessions.length > 0) {
      examSession = sessions[0].sessionName;
    }
  }

  const page = typeof query.page === "number" && query.page >= 0 ? query.page : 0;
  const pageSize =
    typeof query.pageSize === "number" && query.pageSize > 0
      ? query.pageSize
      : 20;

  const where: Prisma.QuestionWhereInput = {
    type: QuestionType.BANK,
    isDeleted: false,
    ...(examSession ? { examSession } : {}),
    ...(query.subject ? { subject: query.subject } : {}),
  };

  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: page * pageSize,
      take: pageSize,
    }),
  ]);

  const items: IQuestionBankItemDto[] = questions.map((q) => ({
    id: q.id,
    subject: q.subject,
    examSession: q.examSession || "",
    topic: q.topic,
    questionText: q.questionText,
    optionA: q.optionA,
    optionB: q.optionB,
    optionC: q.optionC,
    optionD: q.optionD,
    correctOption: q.correctOption,
    explanation: q.explanation,
    difficulty: q.difficulty,
  }));

  return {
    items,
    page,
    pageSize,
    total,
  };
};

export const QuestionBankService = {
  listSessions,
  listQuestions,
};

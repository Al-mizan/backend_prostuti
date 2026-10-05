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

  const getOrdinal = (n: number): string => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  const matchedDbKeys = new Set<string>();

  for (let edition = 50; edition >= 10; edition--) {
    const isShort = shortEditions.has(edition) || edition <= 34;
    const defaultCount = edition === 37 ? 198 : isShort ? 100 : 200;
    const durationMinutes = isShort ? 60 : 120;
    const totalMarks = isShort ? 100.0 : 200.0;

    let count = edition > 47 ? 0 : defaultCount;
    for (const [key, value] of dbCounts.entries()) {
      const match = key.match(/\b(\d+)(?:st|nd|rd|th)?\b/i);
      if (match && parseInt(match[1], 10) === edition) {
        count = value;
        matchedDbKeys.add(key);
        break;
      }
    }

    let sessionName: string;
    if (edition === 49) {
      sessionName = "49th BCS(General) Preli";
    } else if (edition === 48) {
      sessionName = "48th BCS(Special) Preli";
    } else {
      sessionName = `${edition}th BCS Preli`;
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
    if (!matchedDbKeys.has(name)) {
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
  const rawSession = query.examSession?.trim();
  const isAllOrEmpty = !rawSession || rawSession.toUpperCase() === "ALL";

  let resolvedExamSession: string | undefined = undefined;

  if (!isAllOrEmpty && rawSession) {
    const exactCount = await prisma.question.count({
      where: {
        type: QuestionType.BANK,
        isDeleted: false,
        examSession: rawSession,
      },
    });

    if (exactCount > 0) {
      resolvedExamSession = rawSession;
    } else {
      const match = rawSession.match(/\b(\d+)(?:st|nd|rd|th)?\b/i);
      if (match) {
        const editionNum = match[1];
        const candidate = await prisma.question.findFirst({
          where: {
            type: QuestionType.BANK,
            isDeleted: false,
            OR: [
              { examSession: { contains: `${editionNum}th`, mode: "insensitive" } },
              { examSession: { contains: `${editionNum}st`, mode: "insensitive" } },
              { examSession: { contains: `${editionNum}nd`, mode: "insensitive" } },
              { examSession: { contains: `${editionNum}rd`, mode: "insensitive" } },
              { examSession: { contains: rawSession, mode: "insensitive" } },
            ],
          },
          select: { examSession: true },
        });
        if (candidate?.examSession) {
          resolvedExamSession = candidate.examSession;
        } else {
          resolvedExamSession = rawSession;
        }
      } else {
        resolvedExamSession = rawSession;
      }
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
    ...(resolvedExamSession ? { examSession: resolvedExamSession } : {}),
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

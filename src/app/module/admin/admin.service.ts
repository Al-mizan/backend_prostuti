import { parse } from "csv-parse";
import busboy from "busboy";
import { Request } from "express";
import httpStatus from "http-status";
import {
  Difficulty,
  Option,
  QuestionType,
  Role,
  Subject,
} from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import {
  CSV_CHUNK_SIZE,
  HEADER_BANK,
  HEADER_PRACTICE,
  MAX_FILE_SIZE_BYTES,
  MAX_OPTION_LENGTH,
  MAX_QUESTION_LENGTH,
} from "./admin.constant";
import {
  IAdminQuestionDto,
  IAdminUserDto,
  IImportSummary,
  IListQuestionsQuery,
  IPaginatedQuestionsResult,
  IRejectedRow,
  IUpdateQuestionPayload,
} from "./admin.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseAndValidateCsv = (
  fileStream: NodeJS.ReadableStream,
  expectedHeader: readonly string[],
  type: QuestionType,
  userId: string
): Promise<IImportSummary> => {
  return new Promise<IImportSummary>((resolve, reject) => {
    let headerParsed = false;
    let streamFailed = false;
    const validRows: any[] = [];
    const rejected: IRejectedRow[] = [];

    const fail = (err: any) => {
      if (!streamFailed) {
        streamFailed = true;
        reject(err);
      }
    };

    const parser = parse({
      columns: (headers: string[]) => {
        headerParsed = true;
        const trimmed = headers.map((h) => h.trim());
        const expectedStr = expectedHeader.join(",");
        const actualStr = trimmed.join(",");
        if (expectedStr !== actualStr) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            `header mismatch: expected [${expectedStr}] got [${actualStr}]`
          );
        }
        return trimmed;
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    fileStream.pipe(parser);

    fileStream.on("error", (err) => fail(err));
    parser.on("error", (err) => fail(err));

    parser.on("data", (record: Record<string, string>) => {
      // Check if completely blank row
      const isBlank = Object.values(record).every(
        (v) => !v || v.trim().length === 0
      );
      if (isBlank) return;

      const rowNumber = parser.info.lines;
      const errors: string[] = [];

      // exam_session validation (only for BANK)
      let examSession: string | null = null;
      if (type === QuestionType.BANK) {
        const rawSession = record.exam_session;
        if (!rawSession || rawSession.trim() === "") {
          errors.push("exam_session required");
        } else {
          examSession = rawSession.trim();
        }
      }

      // subject validation
      let subject: Subject | null = null;
      const rawSubject = record.subject;
      if (!rawSubject || rawSubject.trim() === "") {
        errors.push("subject required");
      } else {
        const trimmedSubject = rawSubject.trim();
        if (Object.values(Subject).includes(trimmedSubject as Subject)) {
          subject = trimmedSubject as Subject;
        } else {
          errors.push(`subject '${trimmedSubject}' is not a valid value`);
        }
      }

      // topic validation (optional)
      const topic = record.topic?.trim() || null;

      // question_text validation
      const questionText = record.question_text?.trim();
      if (!questionText || questionText === "") {
        errors.push("question_text required");
      } else if (questionText.length > MAX_QUESTION_LENGTH) {
        errors.push(`question_text > ${MAX_QUESTION_LENGTH} chars`);
      }

      // options validation
      const optionA = record.option_a?.trim();
      const optionB = record.option_b?.trim();
      const optionC = record.option_c?.trim();
      const optionD = record.option_d?.trim();

      const options = [
        { name: "option_a", val: optionA },
        { name: "option_b", val: optionB },
        { name: "option_c", val: optionC },
        { name: "option_d", val: optionD },
      ];

      for (const opt of options) {
        if (!opt.val || opt.val === "") {
          errors.push(`${opt.name} required`);
        } else if (opt.val.length > MAX_OPTION_LENGTH) {
          errors.push(`${opt.name} > ${MAX_OPTION_LENGTH} chars`);
        }
      }

      // correct_option validation
      let correctOption: Option | null = null;
      const rawCorrect = record.correct_option?.trim();
      if (!rawCorrect || rawCorrect === "") {
        errors.push("correct_option required");
      } else {
        const upper = rawCorrect.toUpperCase();
        if (Object.values(Option).includes(upper as Option)) {
          correctOption = upper as Option;
        } else {
          errors.push(`correct_option '${rawCorrect}' is not a valid value`);
        }
      }

      // explanation validation (optional)
      const explanation = record.explanation?.trim() || null;

      // difficulty validation (optional)
      let difficulty: Difficulty | null = null;
      const rawDifficulty = record.difficulty?.trim();
      if (rawDifficulty && rawDifficulty !== "") {
        const upperDiff = rawDifficulty.toUpperCase();
        if (Object.values(Difficulty).includes(upperDiff as Difficulty)) {
          difficulty = upperDiff as Difficulty;
        } else {
          errors.push(`difficulty '${rawDifficulty}' is not a valid value`);
        }
      }

      if (errors.length > 0) {
        const reason = errors.join("; ");
        rejected.push({
          rowNumber,
          reason,
          row: rowNumber,
          message: reason,
        });
        return;
      }

      validRows.push({
        type,
        examSession,
        subject: subject!,
        topic,
        questionText: questionText!,
        optionA: optionA!,
        optionB: optionB!,
        optionC: optionC!,
        optionD: optionD!,
        correctOption: correctOption!,
        explanation,
        difficulty,
        createdBy: userId,
      });
    });

    parser.on("end", async () => {
      if (streamFailed) return;

      if (!headerParsed) {
        return fail(
          new AppError(httpStatus.BAD_REQUEST, "Empty or invalid CSV file")
        );
      }

      try {
        for (let i = 0; i < validRows.length; i += CSV_CHUNK_SIZE) {
          const chunk = validRows.slice(i, i + CSV_CHUNK_SIZE);
          await prisma.question.createMany({
            data: chunk,
          });
        }

        resolve({
          imported: validRows.length,
          rejected,
        });
      } catch (insertErr) {
        fail(insertErr);
      }
    });
  });
};

const parseAndImportMultipartCsv = (
  req: Request,
  type: QuestionType,
  userId: string
): Promise<IImportSummary> => {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return reject(
        new AppError(
          httpStatus.BAD_REQUEST,
          "Content-Type must be multipart/form-data"
        )
      );
    }

    let settled = false;
    const safeReject = (err: any) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    const safeResolve = (summary: IImportSummary) => {
      if (!settled) {
        settled = true;
        resolve(summary);
      }
    };

    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_FILE_SIZE_BYTES,
          files: 1,
        },
      });
    } catch {
      return safeReject(
        new AppError(
          httpStatus.BAD_REQUEST,
          "Failed to initialize multipart parser"
        )
      );
    }

    let fileFound = false;
    let importPromise: Promise<IImportSummary> | null = null;
    let fileLimitReached = false;

    bb.on("file", (_fieldname, fileStream) => {
      fileFound = true;

      fileStream.on("limit", () => {
        fileLimitReached = true;
        safeReject(
          new AppError(
            httpStatus.REQUEST_ENTITY_TOO_LARGE,
            "File size exceeds 5MB limit"
          )
        );
      });

      const expectedHeader =
        type === QuestionType.BANK ? HEADER_BANK : HEADER_PRACTICE;
      importPromise = parseAndValidateCsv(
        fileStream,
        expectedHeader,
        type,
        userId
      );
    });

    bb.on("error", (err) => {
      safeReject(err);
    });

    bb.on("close", async () => {
      if (fileLimitReached) return;
      if (!fileFound || !importPromise) {
        return safeReject(
          new AppError(
            httpStatus.BAD_REQUEST,
            "No CSV file uploaded in multipart request"
          )
        );
      }

      try {
        const summary = await importPromise;
        safeResolve(summary);
      } catch (err) {
        safeReject(err);
      }
    });

    req.pipe(bb);
  });
};

const listQuestions = async (
  query: IListQuestionsQuery
): Promise<IPaginatedQuestionsResult> => {
  const page = query.page ?? 0;
  const pageSize = query.pageSize ?? 20;

  const where: any = { isDeleted: false };
  if (query.type) where.type = query.type;
  if (query.examSession && query.examSession.trim() !== "") {
    where.examSession = query.examSession.trim();
  }
  if (query.subject) where.subject = query.subject;

  const total = await prisma.question.count({ where });
  const questions = await prisma.question.findMany({
    where,
    skip: page * pageSize,
    take: pageSize,
    orderBy: { createdAt: "desc" },
  });

  return {
    items: questions.map((q) => ({
      id: q.id,
      type: q.type,
      subject: q.subject,
      examSession: q.examSession,
      topic: q.topic,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: q.correctOption,
      explanation: q.explanation,
      difficulty: q.difficulty,
      createdAt: q.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
  };
};

const updateQuestion = async (
  id: string,
  payload: IUpdateQuestionPayload
): Promise<IAdminQuestionDto> => {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(httpStatus.NOT_FOUND, `Question ${id} not found`);
  }

  const existing = await prisma.question.findUnique({
    where: { id },
  });

  if (!existing || existing.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, `Question ${id} not found`);
  }

  if (
    existing.type === QuestionType.BANK &&
    (!existing.examSession || existing.examSession.trim() === "")
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "BANK question is missing exam_session — fix by re-importing"
    );
  }

  const updated = await prisma.question.update({
    where: { id },
    data: {
      subject: payload.subject,
      topic: payload.topic?.trim() || null,
      questionText: payload.questionText.trim(),
      optionA: payload.optionA.trim(),
      optionB: payload.optionB.trim(),
      optionC: payload.optionC.trim(),
      optionD: payload.optionD.trim(),
      correctOption: payload.correctOption,
      explanation: payload.explanation?.trim() || null,
      difficulty: payload.difficulty ?? null,
    },
  });

  return {
    id: updated.id,
    type: updated.type,
    subject: updated.subject,
    examSession: updated.examSession,
    topic: updated.topic,
    questionText: updated.questionText,
    optionA: updated.optionA,
    optionB: updated.optionB,
    optionC: updated.optionC,
    optionD: updated.optionD,
    correctOption: updated.correctOption,
    explanation: updated.explanation,
    difficulty: updated.difficulty,
    createdAt: updated.createdAt.toISOString(),
  };
};

const deleteQuestion = async (id: string): Promise<void> => {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(httpStatus.NOT_FOUND, `Question ${id} not found`);
  }

  const question = await prisma.question.findUnique({
    where: { id },
  });

  if (!question) {
    throw new AppError(httpStatus.NOT_FOUND, `Question ${id} not found`);
  }

  const practiceRef = await prisma.practiceSessionQuestion.findFirst({
    where: { questionId: id },
  });

  const examRef = await prisma.examAttemptQuestion.findFirst({
    where: { questionId: id },
  });

  if (practiceRef || examRef) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Question is referenced by a saved session and cannot be deleted"
    );
  }

  await prisma.question.delete({
    where: { id },
  });
};

const listUsers = async (): Promise<IAdminUserDto[]> => {
  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }));
};

const updateUserRole = async (
  userId: string,
  newRole: Role
): Promise<IAdminUserDto> => {
  if (!UUID_REGEX.test(userId)) {
    throw new AppError(httpStatus.NOT_FOUND, `User ${userId} not found`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, `User ${userId} not found`);
  }

  if (user.role === Role.ADMIN && newRole === Role.STUDENT) {
    const adminCount = await prisma.user.count({
      where: { role: Role.ADMIN, isDeleted: false },
    });
    if (adminCount <= 1) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Cannot demote the last remaining admin"
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  });

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    createdAt: updated.createdAt.toISOString(),
  };
};

export const AdminService = {
  parseAndImportMultipartCsv,
  listQuestions,
  updateQuestion,
  deleteQuestion,
  listUsers,
  updateUserRole,
};

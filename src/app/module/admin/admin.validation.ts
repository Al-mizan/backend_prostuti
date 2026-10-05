import z from "zod";
import {
  Difficulty,
  Option,
  QuestionType,
  Role,
  Subject,
} from "../../../generated/prisma/enums";
import { MAX_OPTION_LENGTH, MAX_QUESTION_LENGTH } from "./admin.constant";

const updateQuestionSchema = z.object({
  subject: z.nativeEnum(Subject, {
    error: (issue) =>
      issue.code === "invalid_value"
        ? "Invalid subject"
        : "Subject is required",
  }),
  topic: z.string().nullable().optional(),
  questionText: z
    .string()
    .trim()
    .min(1, "Question text cannot be empty")
    .max(MAX_QUESTION_LENGTH, `Question text exceeds ${MAX_QUESTION_LENGTH} characters`),
  optionA: z
    .string()
    .trim()
    .min(1, "Option A cannot be empty")
    .max(MAX_OPTION_LENGTH, `Option A exceeds ${MAX_OPTION_LENGTH} characters`),
  optionB: z
    .string()
    .trim()
    .min(1, "Option B cannot be empty")
    .max(MAX_OPTION_LENGTH, `Option B exceeds ${MAX_OPTION_LENGTH} characters`),
  optionC: z
    .string()
    .trim()
    .min(1, "Option C cannot be empty")
    .max(MAX_OPTION_LENGTH, `Option C exceeds ${MAX_OPTION_LENGTH} characters`),
  optionD: z
    .string()
    .trim()
    .min(1, "Option D cannot be empty")
    .max(MAX_OPTION_LENGTH, `Option D exceeds ${MAX_OPTION_LENGTH} characters`),
  correctOption: z.nativeEnum(Option, {
    error: (issue) =>
      issue.code === "invalid_value"
        ? "Invalid correct option"
        : "Correct option is required",
  }),
  explanation: z.string().nullable().optional(),
  difficulty: z.nativeEnum(Difficulty).nullable().optional(),
});

const updateUserRoleSchema = z.object({
  role: z.nativeEnum(Role, {
    error: (issue) =>
      issue.code === "invalid_value" ? "Invalid role" : "Role is required",
  }),
});

const listQuestionsQuerySchema = z.object({
  type: z.nativeEnum(QuestionType).optional(),
  examSession: z.string().trim().optional(),
  subject: z.nativeEnum(Subject).optional(),
  page: z.coerce.number().int().min(0, "Page must be >= 0").default(0),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, "pageSize must be >= 1")
    .max(200, "pageSize must be <= 200")
    .default(20),
});

export const AdminValidation = {
  updateQuestionSchema,
  updateUserRoleSchema,
  listQuestionsQuerySchema,
};

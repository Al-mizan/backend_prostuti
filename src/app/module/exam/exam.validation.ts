import z from "zod";
import { Option } from "../../../generated/prisma/enums";
import {
  DEFAULT_EXAM_DURATION_MINUTES,
  DEFAULT_EXAM_QUESTION_COUNT,
  MAX_EXAM_DURATION_MINUTES,
  MAX_EXAM_QUESTION_COUNT,
  MIN_EXAM_DURATION_MINUTES,
  MIN_EXAM_QUESTION_COUNT,
} from "./exam.constant";

const startSessionSchema = z
  .object({
    examSession: z.string().trim().min(1, "Exam session cannot be blank").optional(),
    modelTestId: z.string().uuid("Invalid model test ID format").optional(),
    questionCount: z.coerce
      .number()
      .int()
      .min(
        MIN_EXAM_QUESTION_COUNT,
        `Question count must be between ${MIN_EXAM_QUESTION_COUNT} and ${MAX_EXAM_QUESTION_COUNT}`
      )
      .max(
        MAX_EXAM_QUESTION_COUNT,
        `Question count must be between ${MIN_EXAM_QUESTION_COUNT} and ${MAX_EXAM_QUESTION_COUNT}`
      )
      .optional(),
    durationMinutes: z.coerce
      .number()
      .int()
      .min(
        MIN_EXAM_DURATION_MINUTES,
        `Duration must be between ${MIN_EXAM_DURATION_MINUTES} and ${MAX_EXAM_DURATION_MINUTES} minutes`
      )
      .max(
        MAX_EXAM_DURATION_MINUTES,
        `Duration must be between ${MIN_EXAM_DURATION_MINUTES} and ${MAX_EXAM_DURATION_MINUTES} minutes`
      )
      .optional(),
  })
  .refine((data) => Boolean(data.examSession || data.modelTestId), {
    message: "Either examSession or modelTestId must be provided",
    path: ["examSession"],
  });

const submitExamSchema = z.object({
  timeTakenSeconds: z.coerce
    .number()
    .int()
    .min(0, "timeTakenSeconds must be non-negative"),
  answers: z.array(
    z.object({
      questionId: z.string().uuid("Invalid question ID format"),
      selectedOption: z.nativeEnum(Option).nullable().optional(),
    })
  ),
});

export const ExamValidation = {
  startSessionSchema,
  submitExamSchema,
};

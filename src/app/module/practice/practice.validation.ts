import z from "zod";
import { Option, Subject } from "../../../generated/prisma/enums";

const startSessionSchema = z.object({
  subject: z.nativeEnum(Subject, {
    error: (issue) =>
      issue.code === "invalid_value"
        ? "Invalid subject"
        : "Subject is required",
  }),
  count: z.coerce
    .number()
    .int()
    .min(5, "Count must be between 5 and 50")
    .max(50, "Count must be between 5 and 50")
    .default(10),
});

const submitAnswerSchema = z.object({
  questionId: z.string().uuid("Invalid question ID format"),
  selectedOption: z.nativeEnum(Option, {
    error: (issue) =>
      issue.code === "invalid_value"
        ? "Invalid option selected"
        : "Selected option is required",
  }),
});

export const PracticeValidation = {
  startSessionSchema,
  submitAnswerSchema,
};

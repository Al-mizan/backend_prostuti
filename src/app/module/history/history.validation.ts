import z from "zod";
import { Subject } from "../../../generated/prisma/enums";

const getWrongAnswersQuerySchema = z.object({
  subject: z.nativeEnum(Subject, {
    error: (issue) =>
      issue.code === "invalid_value"
        ? "Invalid subject"
        : "Subject is required",
  }).optional(),
});

export const HistoryValidation = {
  getWrongAnswersQuerySchema,
};

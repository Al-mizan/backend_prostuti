import z from "zod";
import { Subject } from "../../../generated/prisma/enums";

const listQuestionsQuerySchema = z.object({
  examSession: z.string().trim().optional(),
  subject: z.nativeEnum(Subject).optional(),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const QuestionBankValidation = {
  listQuestionsQuerySchema,
};

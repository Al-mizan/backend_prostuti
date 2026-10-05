import { z } from "zod";

const createModelTestSchema = z
  .object({
    title: z.string().trim().min(1, "Title must not be blank"),
    description: z.string().trim().nullable().optional(),
    examSession: z.string().trim().min(1, "Exam session cannot be blank"),
    durationMinutes: z.coerce
      .number()
      .int()
      .positive("Duration must be a positive integer")
      .optional()
      .default(120),
    totalMarks: z.coerce
      .number()
      .positive("Total marks must be positive")
      .optional()
      .default(200.0),
    totalQuestions: z.coerce
      .number()
      .int()
      .positive("Total questions must be a positive integer")
      .optional()
      .default(200),
    startTime: z.coerce.date({
      message: "Invalid startTime format",
    }),
    endTime: z.coerce.date({
      message: "Invalid endTime format",
    }),
    isPublished: z.boolean().optional().default(true),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

const updateModelTestSchema = z
  .object({
    title: z.string().trim().min(1, "Title must not be blank").optional(),
    description: z.string().trim().nullable().optional(),
    examSession: z
      .string()
      .trim()
      .min(1, "Exam session cannot be blank")
      .optional(),
    durationMinutes: z.coerce
      .number()
      .int()
      .positive("Duration must be a positive integer")
      .optional(),
    totalMarks: z.coerce
      .number()
      .positive("Total marks must be positive")
      .optional(),
    totalQuestions: z.coerce
      .number()
      .int()
      .positive("Total questions must be a positive integer")
      .optional(),
    startTime: z.coerce
      .date({
        message: "Invalid startTime format",
      })
      .optional(),
    endTime: z.coerce
      .date({
        message: "Invalid endTime format",
      })
      .optional(),
    isPublished: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return new Date(data.endTime) > new Date(data.startTime);
      }
      return true;
    },
    {
      message: "endTime must be after startTime",
      path: ["endTime"],
    }
  );

const getAllModelTestsQuerySchema = z.object({
  status: z
    .enum(["UPCOMING", "LIVE", "EXPIRED", "upcoming", "live", "expired"])
    .optional(),
});

export const ModelTestValidation = {
  createModelTestSchema,
  updateModelTestSchema,
  getAllModelTestsQuerySchema,
};

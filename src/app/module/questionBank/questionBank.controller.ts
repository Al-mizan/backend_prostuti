import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { QuestionBankService } from "./questionBank.service";
import { QuestionBankValidation } from "./questionBank.validation";

const listSessions = catchAsync(async (_req: Request, res: Response) => {
  const result = await QuestionBankService.listSessions();

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "BCS sessions fetched successfully",
    data: result,
  });
});

const listQuestions = catchAsync(async (req: Request, res: Response) => {
  const parsedQuery = QuestionBankValidation.listQuestionsQuerySchema.parse(
    req.query
  );
  const result = await QuestionBankService.listQuestions(parsedQuery);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Questions fetched successfully",
    data: result,
    meta: {
      page: result.page,
      limit: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize) || 1,
    },
  });
});

export const QuestionBankController = {
  listSessions,
  listQuestions,
};

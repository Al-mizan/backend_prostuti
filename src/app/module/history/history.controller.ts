import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { HistoryService } from "./history.service";
import { HistoryValidation } from "./history.validation";

const getAttempts = catchAsync(async (req: Request, res: Response) => {
  const result = await HistoryService.getAttempts(req.user!.userId);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Attempts history retrieved successfully",
    data: result,
  });
});

const getWrongAnswers = catchAsync(async (req: Request, res: Response) => {
  const parsedQuery = HistoryValidation.getWrongAnswersQuerySchema.parse(
    req.query
  );
  const result = await HistoryService.getWrongAnswers(
    req.user!.userId,
    parsedQuery.subject
  );

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Wrong answers retrieved successfully",
    data: result,
  });
});

export const HistoryController = {
  getAttempts,
  getWrongAnswers,
};

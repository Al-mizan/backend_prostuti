import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { PracticeService } from "./practice.service";

const startSession = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const result = await PracticeService.startSession(
    userId as string,
    req.body
  );

  sendResponse(res, {
    httpStatusCode: httpStatus.CREATED,
    success: true,
    message: "Practice session started successfully",
    data: result,
  });
});

const submitAnswer = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const id = req.params.id as string;
  const result = await PracticeService.submitAnswer(
    userId as string,
    id,
    req.body
  );

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Answer submitted successfully",
    data: result,
  });
});

const finishSession = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const id = req.params.id as string;
  const result = await PracticeService.finishSession(userId as string, id);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Practice session finished successfully",
    data: result,
  });
});

export const PracticeController = {
  startSession,
  submitAnswer,
  finishSession,
};

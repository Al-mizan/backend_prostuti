import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { ExamService } from "./exam.service";

const startSession = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamService.startSession(req.user!.userId, req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.CREATED,
    success: true,
    message: "Exam session started successfully",
    data: result,
  });
});

const submitExam = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await ExamService.submitExam(req.user!.userId, id, req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Exam submitted successfully",
    data: result,
  });
});

const getLeaderboard = catchAsync(async (req: Request, res: Response) => {
  const examSession = req.params.examSession as string;
  const result = await ExamService.getLeaderboard(examSession);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Leaderboard retrieved successfully",
    data: result,
  });
});

export const ExamController = {
  startSession,
  submitExam,
  getLeaderboard,
};

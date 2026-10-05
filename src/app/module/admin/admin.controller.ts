import { Request, Response } from "express";
import httpStatus from "http-status";
import { QuestionType } from "../../../generated/prisma/enums";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { AdminService } from "./admin.service";
import { AdminValidation } from "./admin.validation";

const importQuestionBankCsv = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.parseAndImportMultipartCsv(
    req,
    QuestionType.BANK,
    req.user!.userId
  );

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Question bank CSV imported successfully",
    data: result,
  });
});

const importPracticeQuestionsCsv = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AdminService.parseAndImportMultipartCsv(
      req,
      QuestionType.PRACTICE,
      req.user!.userId
    );

    sendResponse(res, {
      httpStatusCode: httpStatus.OK,
      success: true,
      message: "Practice questions CSV imported successfully",
      data: result,
    });
  }
);

const listQuestions = catchAsync(async (req: Request, res: Response) => {
  const parsedQuery = AdminValidation.listQuestionsQuerySchema.parse(req.query);
  const result = await AdminService.listQuestions(parsedQuery);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Questions retrieved successfully",
    data: result,
    meta: {
      page: result.page,
      limit: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize) || 1,
    },
  });
});

const updateQuestion = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await AdminService.updateQuestion(id, req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Question updated successfully",
    data: result,
  });
});

const deleteQuestion = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await AdminService.deleteQuestion(id);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Question deleted successfully",
  });
});

const listUsers = catchAsync(async (_req: Request, res: Response) => {
  const result = await AdminService.listUsers();

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Users retrieved successfully",
    data: result,
  });
});

const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await AdminService.updateUserRole(id, req.body.role);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "User role updated successfully",
    data: result,
  });
});

export const AdminController = {
  importQuestionBankCsv,
  importPracticeQuestionsCsv,
  listQuestions,
  updateQuestion,
  deleteQuestion,
  listUsers,
  updateUserRole,
};

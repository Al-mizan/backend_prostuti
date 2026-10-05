import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { ModelTestStatus } from "./modelTest.interface";
import { ModelTestService } from "./modelTest.service";

const getLiveModelTest = catchAsync(async (_req: Request, res: Response) => {
  const result = await ModelTestService.getLiveModelTest();

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: result
      ? "Live model test retrieved successfully"
      : "No live or upcoming model test found",
    data: result,
  });
});

const getAllModelTests = catchAsync(async (req: Request, res: Response) => {
  let status: ModelTestStatus | undefined;
  if (req.query.status) {
    status = (req.query.status as string).toUpperCase() as ModelTestStatus;
  }

  const result = await ModelTestService.getAllModelTests(status);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Model tests retrieved successfully",
    data: result,
  });
});

const getModelTestById = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await ModelTestService.getModelTestById(id);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Model test retrieved successfully",
    data: result,
  });
});

const createModelTest = catchAsync(async (req: Request, res: Response) => {
  const result = await ModelTestService.createModelTest(req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.CREATED,
    success: true,
    message: "Model test created successfully",
    data: result,
  });
});

const updateModelTest = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await ModelTestService.updateModelTest(id, req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Model test updated successfully",
    data: result,
  });
});

const deleteModelTest = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await ModelTestService.deleteModelTest(id);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Model test deleted successfully",
  });
});

export const ModelTestController = {
  getLiveModelTest,
  getAllModelTests,
  getModelTestById,
  createModelTest,
  updateModelTest,
  deleteModelTest,
};

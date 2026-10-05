import httpStatus from "http-status";
import { ModelTest } from "../../../generated/prisma/client";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import {
  ICreateModelTestPayload,
  IModelTestDto,
  IUpdateModelTestPayload,
  ModelTestStatus,
} from "./modelTest.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const computeModelTestStatus = (
  startTime: Date,
  endTime: Date,
  now: Date = new Date()
): ModelTestStatus => {
  if (now < startTime) {
    return "UPCOMING";
  }
  if (now > endTime) {
    return "EXPIRED";
  }
  return "LIVE";
};

export const toModelTestDto = (test: ModelTest): IModelTestDto => ({
  id: test.id,
  title: test.title,
  description: test.description,
  examSession: test.examSession,
  durationMinutes: test.durationMinutes,
  totalMarks: test.totalMarks,
  totalQuestions: test.totalQuestions,
  startTime: test.startTime.toISOString(),
  endTime: test.endTime.toISOString(),
  isPublished: test.isPublished,
  status: computeModelTestStatus(test.startTime, test.endTime),
  createdAt: test.createdAt.toISOString(),
  updatedAt: test.updatedAt.toISOString(),
});

const getLiveModelTest = async (): Promise<IModelTestDto | null> => {
  const now = new Date();

  // 1. Try to find currently active live test (startTime <= now <= endTime, isPublished: true)
  const activeTest = await prisma.modelTest.findFirst({
    where: {
      isPublished: true,
      startTime: { lte: now },
      endTime: { gte: now },
    },
    orderBy: {
      startTime: "asc",
    },
  });

  if (activeTest) {
    return toModelTestDto(activeTest);
  }

  // 2. If none, return the nearest upcoming test (startTime > now, isPublished: true)
  const upcomingTest = await prisma.modelTest.findFirst({
    where: {
      isPublished: true,
      startTime: { gt: now },
    },
    orderBy: {
      startTime: "asc",
    },
  });

  if (upcomingTest) {
    return toModelTestDto(upcomingTest);
  }

  return null;
};

const getAllModelTests = async (
  status?: ModelTestStatus
): Promise<IModelTestDto[]> => {
  const now = new Date();
  const whereClause: {
    startTime?: { lte?: Date; gt?: Date };
    endTime?: { gte?: Date; lt?: Date };
  } = {};

  if (status === "LIVE") {
    whereClause.startTime = { lte: now };
    whereClause.endTime = { gte: now };
  } else if (status === "UPCOMING") {
    whereClause.startTime = { gt: now };
  } else if (status === "EXPIRED") {
    whereClause.endTime = { lt: now };
  }

  const tests = await prisma.modelTest.findMany({
    where: whereClause,
    orderBy: [
      { startTime: status === "EXPIRED" ? "desc" : "asc" },
      { createdAt: "desc" },
    ],
  });

  return tests.map(toModelTestDto);
};

const getModelTestById = async (id: string): Promise<IModelTestDto> => {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
  }

  const test = await prisma.modelTest.findUnique({
    where: { id },
  });

  if (!test) {
    throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
  }

  return toModelTestDto(test);
};

const createModelTest = async (
  payload: ICreateModelTestPayload
): Promise<IModelTestDto> => {
  const startTime = new Date(payload.startTime);
  const endTime = new Date(payload.endTime);

  if (endTime <= startTime) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "endTime must be after startTime"
    );
  }

  const modelTest = await prisma.modelTest.create({
    data: {
      title: payload.title,
      description: payload.description,
      examSession: payload.examSession,
      durationMinutes: payload.durationMinutes ?? 120,
      totalMarks: payload.totalMarks ?? 200.0,
      totalQuestions: payload.totalQuestions ?? 200,
      startTime,
      endTime,
      isPublished: payload.isPublished ?? true,
    },
  });

  return toModelTestDto(modelTest);
};

const updateModelTest = async (
  id: string,
  payload: IUpdateModelTestPayload
): Promise<IModelTestDto> => {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
  }

  const existing = await prisma.modelTest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
  }

  const startTime =
    payload.startTime !== undefined
      ? new Date(payload.startTime)
      : existing.startTime;
  const endTime =
    payload.endTime !== undefined ? new Date(payload.endTime) : existing.endTime;

  if (endTime <= startTime) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "endTime must be after startTime"
    );
  }

  const updated = await prisma.modelTest.update({
    where: { id },
    data: {
      ...(payload.title !== undefined && { title: payload.title }),
      ...(payload.description !== undefined && {
        description: payload.description,
      }),
      ...(payload.examSession !== undefined && {
        examSession: payload.examSession,
      }),
      ...(payload.durationMinutes !== undefined && {
        durationMinutes: payload.durationMinutes,
      }),
      ...(payload.totalMarks !== undefined && {
        totalMarks: payload.totalMarks,
      }),
      ...(payload.totalQuestions !== undefined && {
        totalQuestions: payload.totalQuestions,
      }),
      ...(payload.startTime !== undefined && { startTime }),
      ...(payload.endTime !== undefined && { endTime }),
      ...(payload.isPublished !== undefined && {
        isPublished: payload.isPublished,
      }),
    },
  });

  return toModelTestDto(updated);
};

const deleteModelTest = async (id: string): Promise<void> => {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
  }

  const existing = await prisma.modelTest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Model test not found");
  }

  await prisma.modelTest.delete({
    where: { id },
  });
};

export const ModelTestService = {
  getLiveModelTest,
  getAllModelTests,
  getModelTestById,
  createModelTest,
  updateModelTest,
  deleteModelTest,
};

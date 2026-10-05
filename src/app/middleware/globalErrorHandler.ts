import { ErrorRequestHandler } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { envVars } from "../config/env";
import AppError from "../errorHelpers/AppError";
import { handleZodError } from "../errorHelpers/handleZodError";
import {
  handlePrismaClientKnownRequestError,
  handlePrismaValidationError,
} from "../errorHelpers/handlePrismaErrors";
import { TErrorSources } from "../interface/error.interface";

export const globalErrorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next
) => {
  let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
  let message = "Something went wrong!";
  let errorSources: TErrorSources[] = [
    {
      path: "",
      message: err?.message || "Something went wrong!",
    },
  ];

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = [
      {
        path: "",
        message: err.message,
      },
    ];
  } else if (err instanceof ZodError) {
    const formatted = handleZodError(err);
    statusCode = formatted.statusCode || httpStatus.BAD_REQUEST;
    message = formatted.message;
    errorSources = formatted.errorSources;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const formatted = handlePrismaClientKnownRequestError(err);
    statusCode = formatted.statusCode || httpStatus.BAD_REQUEST;
    message = formatted.message;
    errorSources = formatted.errorSources;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    const formatted = handlePrismaValidationError(err);
    statusCode = formatted.statusCode || httpStatus.BAD_REQUEST;
    message = formatted.message;
    errorSources = formatted.errorSources;
  } else if (err instanceof Error) {
    message = err.message;
    errorSources = [
      {
        path: "",
        message: err.message,
      },
    ];
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    ...(envVars.NODE_ENV === "development" && { stack: err?.stack }),
  });
};

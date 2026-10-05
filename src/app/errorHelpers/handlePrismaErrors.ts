import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client";
import { TErrorResponse, TErrorSources } from "../interface/error.interface";

export const handlePrismaClientKnownRequestError = (
  err: Prisma.PrismaClientKnownRequestError
): TErrorResponse => {
  let statusCode: number = httpStatus.BAD_REQUEST;
  let message = "Database Error";
  let errorSources: TErrorSources[] = [
    {
      path: "",
      message: err.message,
    },
  ];

  switch (err.code) {
    case "P2002": {
      statusCode = httpStatus.CONFLICT;
      const target = Array.isArray(err.meta?.target)
        ? err.meta.target.join(", ")
        : (err.meta?.target as string) || "field";
      message = `Duplicate entry for ${target}`;
      errorSources = [
        {
          path: target,
          message: `${target} already exists`,
        },
      ];
      break;
    }
    case "P2001":
    case "P2025": {
      statusCode = httpStatus.NOT_FOUND;
      message = "Record not found";
      errorSources = [
        {
          path: "",
          message: (err.meta?.cause as string) || "Requested record was not found",
        },
      ];
      break;
    }
    case "P2003": {
      statusCode = httpStatus.BAD_REQUEST;
      message = "Foreign key constraint violation";
      errorSources = [
        {
          path: (err.meta?.field_name as string) || "",
          message: "Referenced record does not exist",
        },
      ];
      break;
    }
    case "P1000": {
      statusCode = httpStatus.UNAUTHORIZED;
      message = "Database authentication failed";
      break;
    }
    case "P1010": {
      statusCode = httpStatus.FORBIDDEN;
      message = "Database access denied";
      break;
    }
    case "P1008": {
      statusCode = httpStatus.GATEWAY_TIMEOUT;
      message = "Database operation timed out";
      break;
    }
    case "P5011": {
      statusCode = httpStatus.TOO_MANY_REQUESTS;
      message = "Database request rate limit exceeded";
      break;
    }
    default: {
      statusCode = httpStatus.BAD_REQUEST;
      message = err.message || "Database request failed";
      break;
    }
  }

  return {
    statusCode,
    success: false,
    message,
    errorSources,
  };
};

export const handlePrismaValidationError = (
  err: Prisma.PrismaClientValidationError
): TErrorResponse => {
  return {
    statusCode: httpStatus.BAD_REQUEST,
    success: false,
    message: "Prisma validation error",
    errorSources: [
      {
        path: "",
        message: err.message,
      },
    ],
  };
};

import { ZodError } from "zod";
import httpStatus from "http-status";
import { TErrorResponse, TErrorSources } from "../interface/error.interface";

export const handleZodError = (err: ZodError): TErrorResponse => {
  const errorSources: TErrorSources[] = err.issues.map((issue) => {
    return {
      path: issue.path.length > 0 ? issue.path.join(".") : "",
      message: issue.message,
    };
  });

  return {
    statusCode: httpStatus.BAD_REQUEST,
    success: false,
    message: "Validation Error",
    errorSources,
  };
};

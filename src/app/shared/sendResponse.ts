import { Response } from "express";

export interface IMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface IResponseData<T> {
  httpStatusCode: number;
  success: boolean;
  message: string;
  data?: T;
  meta?: IMeta;
}

export const sendResponse = <T>(res: Response, data: IResponseData<T>) => {
  const responsePayload: Record<string, unknown> = {
    success: data.success,
    message: data.message,
  };

  if (data.data !== undefined) {
    responsePayload.data = data.data;
  }

  if (data.meta !== undefined) {
    responsePayload.meta = data.meta;
  }

  return res.status(data.httpStatusCode).json(responsePayload);
};

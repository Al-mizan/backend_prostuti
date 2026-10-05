import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { AuthService } from "./auth.service";

const register = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.register(req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.CREATED,
    success: true,
    message: "User registered successfully",
    data: result,
  });
});

const login = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.login(req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Login successful",
    data: result,
  });
});

const loginWithGoogle = catchAsync(async (req: Request, res: Response) => {
  const { idToken } = req.body;
  const result = await AuthService.loginWithGoogle(idToken);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Google login successful",
    data: result,
  });
});

const bootstrapAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.bootstrapAdmin(req.body);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Admin bootstrap successful",
    data: result,
  });
});

const me = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const result = await AuthService.me(userId as string);

  sendResponse(res, {
    httpStatusCode: httpStatus.OK,
    success: true,
    message: "Current user profile fetched successfully",
    data: result,
  });
});

export const AuthController = {
  register,
  login,
  loginWithGoogle,
  bootstrapAdmin,
  me,
};

import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Role } from "../../generated/prisma/enums";
import { envVars } from "../config/env";
import AppError from "../errorHelpers/AppError";
import { prisma } from "../lib/prisma";
import { verifyToken } from "../utils/jwt";

export const checkAuth = (...roles: Role[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      let token = req.cookies?.accessToken;

      if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(" ");
        if (parts.length === 2 && parts[0] === "Bearer") {
          token = parts[1];
        }
      }

      if (!token) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized");
      }

      let decoded: any;
      try {
        decoded = verifyToken(token, envVars.JWT_SECRET);
      } catch {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          "Unauthorized: Invalid or expired token"
        );
      }

      const userId = decoded.sub || decoded.userId;
      if (!userId) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          "Unauthorized: Invalid token payload"
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || user.isDeleted) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          "Unauthorized: User not found or deactivated"
        );
      }

      if (roles.length > 0 && !roles.includes(user.role)) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Forbidden: Insufficient permissions"
        );
      }

      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};

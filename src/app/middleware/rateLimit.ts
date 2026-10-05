import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import AppError from "../errorHelpers/AppError";
import { redisService } from "../lib/redis";

export const createRateLimiter = (limit: number, windowMs: number, tierName = "general") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "test") {
      return next();
    }
    try {
      const clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "127.0.0.1";

      const key = `rate-limit:${tierName}:${clientIp}`;
      const { allowed, remaining } = await redisService.evaluateRateLimit(
        key,
        limit,
        windowMs
      );

      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", remaining);

      if (!allowed) {
        throw new AppError(
          httpStatus.TOO_MANY_REQUESTS,
          "Too many requests. Please try again later."
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const authRateLimiter = createRateLimiter(10, 60 * 1000, "auth");
export const generalRateLimiter = createRateLimiter(100, 60 * 1000, "general");

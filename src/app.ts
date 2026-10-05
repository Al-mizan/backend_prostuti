import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import httpStatus from "http-status";
import passport from "./app/lib/passport";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { generalRateLimiter } from "./app/middleware/rateLimit";
import { IndexRoutes } from "./app/routes/index";

const app: Application = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(generalRateLimiter);
app.use(passport.initialize());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get(["/", "/health"], (_req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Prostuti API is running smoothly",
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

app.use("/api/v1", IndexRoutes);

app.use(globalErrorHandler);
app.use(notFound);

export default app;

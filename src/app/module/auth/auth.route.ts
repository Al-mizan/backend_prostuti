import { NextFunction, Request, Response, Router } from "express";
import httpStatus from "http-status";
import { envVars } from "../../config/env";
import AppError from "../../errorHelpers/AppError";
import { checkAuth } from "../../middleware/checkAuth";
import { authRateLimiter } from "../../middleware/rateLimit";
import { validateRequest } from "../../middleware/validateRequest";
import { constantTimeEquals } from "../../utils/crypto";
import { AuthController } from "./auth.controller";
import { AuthValidation } from "./auth.validation";

const router = Router();

const verifyBootstrapToken = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const token = req.headers["x-bootstrap-token"] as string | undefined;

  if (!token || !constantTimeEquals(token, envVars.BOOTSTRAP_TOKEN)) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid bootstrap token");
  }

  next();
};

router.post(
  "/register",
  authRateLimiter,
  validateRequest(AuthValidation.registerSchema),
  AuthController.register
);

router.post(
  "/login",
  authRateLimiter,
  validateRequest(AuthValidation.loginSchema),
  AuthController.login
);

router.post(
  "/google",
  authRateLimiter,
  validateRequest(AuthValidation.googleSchema),
  AuthController.loginWithGoogle
);

router.post(
  "/bootstrap-admin",
  verifyBootstrapToken,
  validateRequest(AuthValidation.bootstrapAdminSchema),
  AuthController.bootstrapAdmin
);

router.get("/me", checkAuth(), AuthController.me);

export const AuthRoutes = router;

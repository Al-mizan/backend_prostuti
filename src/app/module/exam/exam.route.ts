import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ExamController } from "./exam.controller";
import { ExamValidation } from "./exam.validation";

const router = Router();

router.post(
  "/sessions",
  checkAuth(),
  validateRequest(ExamValidation.startSessionSchema),
  ExamController.startSession
);

router.post(
  "/sessions/:id/submit",
  checkAuth(),
  validateRequest(ExamValidation.submitExamSchema),
  ExamController.submitExam
);

router.get(
  "/leaderboard/:examSession",
  checkAuth(),
  ExamController.getLeaderboard
);

export const ExamRoutes = router;

const leaderboardRouter = Router();
leaderboardRouter.get(
  "/:examSession",
  checkAuth(),
  ExamController.getLeaderboard
);

export const LeaderboardRoutes = leaderboardRouter;

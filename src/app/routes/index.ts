import { Router } from "express";
import { checkAuth } from "../middleware/checkAuth";
import { AdminRoutes } from "../module/admin/admin.route";
import { AuthController } from "../module/auth/auth.controller";
import { AuthRoutes } from "../module/auth/auth.route";
import { ExamRoutes, LeaderboardRoutes } from "../module/exam/exam.route";
import { HistoryRoutes } from "../module/history/history.route";
import {
  ModelTestAdminRoutes,
  ModelTestRoutes,
} from "../module/modelTest/modelTest.route";
import { PracticeRoutes } from "../module/practice/practice.route";
import { QuestionBankRoutes } from "../module/questionBank/questionBank.route";
import { UserRoutes } from "../module/user/user.route";

const router = Router();

router.use("/auth", AuthRoutes);
router.get("/me", checkAuth(), AuthController.me);

router.use("/profile", UserRoutes);
router.use("/users", UserRoutes);
router.use("/question-bank", QuestionBankRoutes);
router.use("/practice", PracticeRoutes);
router.use("/exam", ExamRoutes);
router.use("/leaderboard", LeaderboardRoutes);
router.use("/history", HistoryRoutes);
router.use("/model-tests", ModelTestRoutes);
router.use("/admin/model-tests", ModelTestAdminRoutes);
router.use("/admin", AdminRoutes);

export const IndexRoutes = router;

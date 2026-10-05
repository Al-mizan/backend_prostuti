import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { HistoryController } from "./history.controller";

const router = Router();

router.get("/attempts", checkAuth(), HistoryController.getAttempts);
router.get("/wrong-answers", checkAuth(), HistoryController.getWrongAnswers);

export const HistoryRoutes = router;

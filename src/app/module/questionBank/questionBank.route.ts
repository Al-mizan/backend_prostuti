import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { QuestionBankController } from "./questionBank.controller";

const router = Router();

router.get("/sessions", checkAuth(), QuestionBankController.listSessions);
router.get("/", checkAuth(), QuestionBankController.listQuestions);

export const QuestionBankRoutes = router;

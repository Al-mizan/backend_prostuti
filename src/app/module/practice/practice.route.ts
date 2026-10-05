import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PracticeController } from "./practice.controller";
import { PracticeValidation } from "./practice.validation";

const router = Router();

router.post(
  "/sessions",
  checkAuth(),
  validateRequest(PracticeValidation.startSessionSchema),
  PracticeController.startSession
);

router.post(
  "/sessions/:id/answers",
  checkAuth(),
  validateRequest(PracticeValidation.submitAnswerSchema),
  PracticeController.submitAnswer
);

router.post(
  "/sessions/:id/finish",
  checkAuth(),
  PracticeController.finishSession
);

export const PracticeRoutes = router;

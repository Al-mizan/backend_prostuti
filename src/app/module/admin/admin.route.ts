import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AdminController } from "./admin.controller";
import { AdminValidation } from "./admin.validation";

const router = Router();

// Protect all admin routes with checkAuth(Role.ADMIN)
router.use(checkAuth(Role.ADMIN));

router.post("/question-bank/import", AdminController.importQuestionBankCsv);
router.post(
  "/practice-questions/import",
  AdminController.importPracticeQuestionsCsv
);

router.get("/questions", AdminController.listQuestions);
router.put(
  "/questions/:id",
  validateRequest(AdminValidation.updateQuestionSchema),
  AdminController.updateQuestion
);
router.delete("/questions/:id", AdminController.deleteQuestion);

router.get("/users", AdminController.listUsers);
router.put(
  "/users/:id/role",
  validateRequest(AdminValidation.updateUserRoleSchema),
  AdminController.updateUserRole
);

export const AdminRoutes = router;

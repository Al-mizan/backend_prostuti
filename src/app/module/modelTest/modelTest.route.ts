import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ModelTestController } from "./modelTest.controller";
import { ModelTestValidation } from "./modelTest.validation";

// Public / General router (mounted at /model-tests)
const router = Router();

router.get("/live", ModelTestController.getLiveModelTest);
router.get("/", ModelTestController.getAllModelTests);
router.get("/:id", ModelTestController.getModelTestById);

// Admin-protected routes under /model-tests
router.post(
  "/",
  checkAuth(Role.ADMIN),
  validateRequest(ModelTestValidation.createModelTestSchema),
  ModelTestController.createModelTest
);
router.patch(
  "/:id",
  checkAuth(Role.ADMIN),
  validateRequest(ModelTestValidation.updateModelTestSchema),
  ModelTestController.updateModelTest
);
router.delete(
  "/:id",
  checkAuth(Role.ADMIN),
  ModelTestController.deleteModelTest
);

// Admin-dedicated router (mounted at /admin/model-tests)
const adminRouter = Router();
adminRouter.use(checkAuth(Role.ADMIN));

adminRouter.get("/", ModelTestController.getAllModelTests);
adminRouter.get("/:id", ModelTestController.getModelTestById);
adminRouter.post(
  "/",
  validateRequest(ModelTestValidation.createModelTestSchema),
  ModelTestController.createModelTest
);
adminRouter.patch(
  "/:id",
  validateRequest(ModelTestValidation.updateModelTestSchema),
  ModelTestController.updateModelTest
);
adminRouter.delete("/:id", ModelTestController.deleteModelTest);

export const ModelTestRoutes = router;
export const ModelTestAdminRoutes = adminRouter;

import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = Router();

router.get("/", checkAuth(), UserController.getProfile);
router.put(
  "/",
  checkAuth(),
  validateRequest(UserValidation.updateProfileSchema),
  UserController.updateProfile
);

router.get("/profile", checkAuth(), UserController.getProfile);
router.put(
  "/profile",
  checkAuth(),
  validateRequest(UserValidation.updateProfileSchema),
  UserController.updateProfile
);

export const UserRoutes = router;

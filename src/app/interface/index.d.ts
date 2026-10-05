import { Role } from "../../generated/prisma/enums";

declare global {
  namespace Express {
    interface User {
      userId: string;
      email: string;
      role: Role;
    }
  }
}

export {};

import { Role } from "../../../generated/prisma/enums";

export interface IUserProfileDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarId: string;
  createdAt: string;
}

export interface IUpdateProfilePayload {
  name: string;
  avatarId: string;
}

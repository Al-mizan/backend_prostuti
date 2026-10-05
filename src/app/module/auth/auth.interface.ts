import { Role } from "../../../generated/prisma/enums";

export interface IRegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface ILoginPayload {
  email: string;
  password: string;
}

export interface IGoogleAuthPayload {
  idToken: string;
}

export interface IBootstrapAdminPayload {
  name: string;
  email: string;
  password: string;
}

export interface IAuthResponse {
  token: string;
  userId: string;
  role: Role;
}

export interface IMeResponse {
  userId: string;
  role: Role;
}

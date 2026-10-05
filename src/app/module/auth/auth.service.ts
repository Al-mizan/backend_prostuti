import bcrypt from "bcrypt";
import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import { envVars } from "../../config/env";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { createToken } from "../../utils/jwt";
import {
  IAuthResponse,
  IBootstrapAdminPayload,
  ILoginPayload,
  IMeResponse,
  IRegisterPayload,
} from "./auth.interface";

const BCRYPT_COST = 10;

const register = async (payload: IRegisterPayload): Promise<IAuthResponse> => {
  const normalizedEmail = payload.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(payload.password, BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: Role.STUDENT,
      avatarId: "mascot_1",
    },
  });

  const token = createToken(
    { sub: user.id, userId: user.id, role: Role.STUDENT },
    envVars.JWT_SECRET,
    "7d",
    "prostuti"
  );

  return {
    token,
    userId: user.id,
    role: Role.STUDENT,
  };
};

const login = async (payload: ILoginPayload): Promise<IAuthResponse> => {
  const normalizedEmail = payload.email.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      email: normalizedEmail,
      isDeleted: false,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid credentials");
  }

  if (!user.passwordHash) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This account uses Google Sign-In. Please sign in with Google."
    );
  }

  const isMatch = await bcrypt.compare(payload.password, user.passwordHash);
  if (!isMatch) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid credentials");
  }

  const token = createToken(
    { sub: user.id, userId: user.id, role: user.role },
    envVars.JWT_SECRET,
    "7d",
    "prostuti"
  );

  return {
    token,
    userId: user.id,
    role: user.role,
  };
};

const loginWithGoogle = async (idToken: string): Promise<IAuthResponse> => {
  let googleData: { sub: string; email: string; name?: string } | null = null;

  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );

    if (res.ok) {
      const data = await res.json();
      if (data.sub && data.email) {
        googleData = {
          sub: data.sub,
          email: data.email,
          name: data.name,
        };
      }
    }
  } catch (error) {
    console.warn("Google token verification request error:", error);
  }

  if (!googleData) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid Google token");
  }

  const normalizedEmail = googleData.email.trim().toLowerCase();
  const name = googleData.name?.trim() || normalizedEmail.split("@")[0];

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ googleId: googleData.sub }, { email: normalizedEmail }],
    },
  });

  if (existing) {
    if (!existing.googleId) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { googleId: googleData.sub },
      });
    }

    const token = createToken(
      { sub: existing.id, userId: existing.id, role: existing.role },
      envVars.JWT_SECRET,
      "7d",
      "prostuti"
    );

    return {
      token,
      userId: existing.id,
      role: existing.role,
    };
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      googleId: googleData.sub,
      role: Role.STUDENT,
      avatarId: "mascot_1",
    },
  });

  const token = createToken(
    { sub: user.id, userId: user.id, role: Role.STUDENT },
    envVars.JWT_SECRET,
    "7d",
    "prostuti"
  );

  return {
    token,
    userId: user.id,
    role: Role.STUDENT,
  };
};

const bootstrapAdmin = async (
  payload: IBootstrapAdminPayload
): Promise<IAuthResponse> => {
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: Role.ADMIN,
      isDeleted: false,
    },
  });

  if (existingAdmin) {
    const token = createToken(
      { sub: existingAdmin.id, userId: existingAdmin.id, role: Role.ADMIN },
      envVars.JWT_SECRET,
      "7d",
      "prostuti"
    );

    return {
      token,
      userId: existingAdmin.id,
      role: Role.ADMIN,
    };
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(payload.password, BCRYPT_COST);

  const admin = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: Role.ADMIN,
      avatarId: "mascot_1",
    },
  });

  const token = createToken(
    { sub: admin.id, userId: admin.id, role: Role.ADMIN },
    envVars.JWT_SECRET,
    "7d",
    "prostuti"
  );

  return {
    token,
    userId: admin.id,
    role: Role.ADMIN,
  };
};

const me = async (userId: string): Promise<IMeResponse> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  return {
    userId: user.id,
    role: user.role,
  };
};

export const AuthService = {
  register,
  login,
  loginWithGoogle,
  bootstrapAdmin,
  me,
};

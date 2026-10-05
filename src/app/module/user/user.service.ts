import httpStatus from "http-status";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { IUpdateProfilePayload, IUserProfileDto } from "./user.interface";

const getProfile = async (userId: string): Promise<IUserProfileDto> => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isDeleted: false,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarId: user.avatarId,
    createdAt: user.createdAt.toISOString(),
  };
};

const updateProfile = async (
  userId: string,
  payload: IUpdateProfilePayload
): Promise<IUserProfileDto> => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isDeleted: false,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: payload.name.trim(),
      avatarId: payload.avatarId.trim(),
    },
  });

  return {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    avatarId: updatedUser.avatarId,
    createdAt: updatedUser.createdAt.toISOString(),
  };
};

export const UserService = {
  getProfile,
  updateProfile,
};

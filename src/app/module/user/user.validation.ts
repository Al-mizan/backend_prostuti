import z from "zod";

const updateProfileSchema = z.object({
  name: z
    .string({
      error: (issue) =>
        issue.code === "invalid_type"
          ? "Name must be a string"
          : "Name is required",
    })
    .trim()
    .min(1, "Name must not be blank")
    .max(100, "Name must be between 1 and 100 characters"),
  avatarId: z
    .string({
      error: (issue) =>
        issue.code === "invalid_type"
          ? "Avatar must be a string"
          : "Avatar is required",
    })
    .trim()
    .min(1, "Avatar must not be blank"),
});

export const UserValidation = {
  updateProfileSchema,
};

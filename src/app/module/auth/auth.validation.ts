import z from "zod";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name must not be blank"),
  email: z.string().trim().email("Invalid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

const googleSchema = z.object({
  idToken: z.string().min(1, "ID token is required"),
});

const bootstrapAdminSchema = z.object({
  name: z.string().trim().min(1, "Name must not be blank"),
  email: z.string().trim().email("Invalid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

export const AuthValidation = {
  registerSchema,
  loginSchema,
  googleSchema,
  bootstrapAdminSchema,
};

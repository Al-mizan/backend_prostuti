import dotenv from "dotenv";
import z from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  BOOTSTRAP_TOKEN: z.string().min(1, "BOOTSTRAP_TOKEN is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

const loadEnvVariables = (): EnvConfig => {
  const result = envSchema.safeParse({
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL || process.env.DB_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    BOOTSTRAP_TOKEN: process.env.BOOTSTRAP_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URL: process.env.REDIS_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || process.env.WEB_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || process.env.WEB_GOOGLE_CLIENT_SECRET,
  });

  if (!result.success) {
    console.error("Invalid environment configuration:", result.error.format());
    throw new Error(`Invalid environment configuration: ${JSON.stringify(result.error.format())}`);
  }

  return result.data;
};

export const envVars = loadEnvVariables();

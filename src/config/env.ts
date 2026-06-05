import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid connection string" }),
  OPENAI_API_KEY: z.string().min(1, { message: "OPENAI_API_KEY is required" }),
  SYSTEM_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "SYSTEM_DATE must be in YYYY-MM-DD format" })
    .optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default("3000")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;

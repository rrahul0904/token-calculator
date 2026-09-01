import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/schema.ts", "./src/db/controls-schema.ts", "./src/db/gap-closure-schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/token_intelligence",
  },
  strict: true,
  verbose: true,
});

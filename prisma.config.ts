import "dotenv/config"; // Make sure dotenv is installed to load your .env file
import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // This provides the migration database connection URL to Prisma 7
    url: env("DATABASE_URL"),
  },
});

/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.NODE_ENV === "production"
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL_DEV;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});

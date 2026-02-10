import { defineConfig } from "prisma/config";

const schema = "prisma/schema.prisma";
const migrationsPath = "prisma/migrations";

const url =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.STARB_DATABASE_URL;

if (!url) {
  throw new Error(
    "Prisma config missing DATABASE_URL/DIRECT_DATABASE_URL. Set DIRECT_DATABASE_URL for CLI operations (migrations) and DATABASE_URL for runtime.",
  );
}

export default defineConfig({
  schema,
  migrations: { path: migrationsPath },
  datasource: {
    url,
  },
});

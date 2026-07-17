import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databasePath: path.resolve(repoRoot, process.env.DATABASE_PATH ?? "data/homeos.db"),
  homePassword: process.env.HOMEOS_PASSWORD ?? ""
};

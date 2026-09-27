import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import mysql from "mysql2/promise";

const database = process.env.MYSQL_DATABASE || "patidar_samaj";
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3600),
  user: process.env.MYSQL_USER || "cdn",
  password: process.env.MYSQL_PASSWORD || "cdn12345",
});
await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database.replaceAll("`", "``")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await connection.end();
execFileSync(process.execPath, [path.resolve("node_modules/sequelize-cli/lib/sequelize"), "db:migrate", "--env", "development"], { stdio: "inherit" });
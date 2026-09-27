import "dotenv/config";
import crypto from "node:crypto";
import process from "node:process";
import mysql from "mysql2/promise";

const [email] = process.argv.slice(2); if (!email || !process.env.LOCAL_USER_PASSWORD) { console.error("Usage: LOCAL_USER_PASSWORD=... node scripts/set-user-password.mjs <email>"); process.exit(1); }
const salt = crypto.randomBytes(16).toString("hex"); const hash = crypto.scryptSync(process.env.LOCAL_USER_PASSWORD, salt, 64).toString("hex"); const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST || "localhost", port: Number(process.env.MYSQL_PORT || 3600), user: process.env.MYSQL_USER || "cdn", password: process.env.MYSQL_PASSWORD || "cdn12345", database: process.env.MYSQL_DATABASE || "patidar_samaj" }); const [result] = await connection.execute("UPDATE users SET password_hash = ?, is_verified = TRUE, status = 'active', updated_at = NOW() WHERE email = ?", [`${salt}:${hash}`, email.toLowerCase()]); await connection.end(); if (!result.affectedRows) throw new Error("User not found"); console.log("Password hash updated successfully.");
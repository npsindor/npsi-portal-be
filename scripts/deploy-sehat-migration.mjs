import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { migrationDatabaseUrl } from '../dist/database/migration-url.js';
const database = { host: process.env.MYSQL_HOST || 'localhost', port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || 'cdn123', name: process.env.MYSQL_DATABASE || 'patidar_samaj' };
const connection = await mysql.createConnection({ host: database.host, port: database.port, user: database.user, password: database.password, database: database.name, connectTimeout: 10000 });
try {
  const [rows] = await connection.query('SELECT migration_name AS name, finished_at AS finished, rolled_back_at AS rolledBack FROM _prisma_migrations');
  if (rows.some(row => !row.finished && !row.rolledBack)) throw new Error('An incomplete migration exists; no changes made.');
  const applied = new Set(rows.filter(row => row.finished).map(row => row.name));
  const pending = readdirSync('prisma/migrations', { withFileTypes: true }).filter(item => item.isDirectory() && !applied.has(item.name)).map(item => item.name);
  console.log(JSON.stringify({ pending }));
  if (pending.some(name => name !== '20261028010000_sehat_saathi')) throw new Error('Unrelated pending migrations exist; refusing to apply them.');
  if (process.argv.includes('--apply') && pending.length) {
    const cli = path.join(path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')), 'build/index.js');
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: migrationDatabaseUrl(database) } });
  }
  if (process.argv.includes('--apply')) {
    const [tables] = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('sehat_mrs', 'sehat_resources', 'sehat_requests', 'sehat_routings', 'sehat_reports', 'sehat_notifications', 'sehat_audits')");
    console.log(JSON.stringify({ sehatTables: tables.map(table => table.name) }));
  }
} finally { await connection.end(); }

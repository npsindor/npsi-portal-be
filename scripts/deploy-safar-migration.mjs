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
  const incomplete = rows.filter(row => !row.finished && !row.rolledBack);
  if (incomplete.length) {
    if (!process.argv.includes('--recover-empty-safar') || incomplete.some(row => row.name !== '20261028000000_safar_saathi')) throw new Error('An incomplete migration exists; no changes made.');
    for (const table of ['safar_entries', 'safar_matches', 'safar_notices']) {
      const [[count]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      if (Number(count.count) !== 0) throw new Error('Safar tables contain records; refusing automatic recovery.');
    }
    const [constraints] = await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME IN ('safar_entries','safar_matches','safar_notices')");
    if (constraints.length) throw new Error('Some constraints already exist; refusing automatic recovery.');
    const cli = path.join(path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')), 'build/index.js');
    execFileSync(process.execPath, [cli, 'migrate', 'resolve', '--rolled-back', '20261028000000_safar_saathi'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: migrationDatabaseUrl(database) } });
  }
  const applied = new Set(rows.filter(row => row.finished).map(row => row.name));
  const pending = readdirSync('prisma/migrations', { withFileTypes: true }).filter(item => item.isDirectory() && !applied.has(item.name)).map(item => item.name);
  console.log(JSON.stringify({ pending }));
  if (pending.some(name => name !== '20261028000000_safar_saathi')) throw new Error('Unrelated pending migrations exist; refusing to apply them.');
  if (process.argv.includes('--apply') && pending.length) {
    const cli = path.join(path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')), 'build/index.js');
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: migrationDatabaseUrl(database) } });
  }
  if (process.argv.includes('--apply')) {
    const [tables] = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('safar_entries', 'safar_matches', 'safar_notices')");
    console.log(JSON.stringify({ safarTables: tables.map(table => table.name) }));
  }
} finally { await connection.end(); }

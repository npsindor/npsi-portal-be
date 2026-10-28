import 'dotenv/config';
import mysql from 'mysql2/promise';
const db = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, connectTimeout: 10000 });
try {
  const [columns] = await db.query("SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType, COLLATION_NAME AS collationName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','safar_entries','safar_matches','safar_notices') AND COLUMN_NAME IN ('id','user_id','request_id','offer_id','match_id')");
  const [tables] = await db.query("SELECT TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','safar_entries','safar_matches','safar_notices')");
  console.log(JSON.stringify({ columns, tables }, null, 2));
} finally { await db.end(); }

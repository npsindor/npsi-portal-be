require("dotenv").config();

const common = {
  username: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "cdn123",
  database: process.env.MYSQL_DATABASE || "patidar_samaj",
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  dialect: "mysql",
  logging: false,
};

module.exports = { development: common, test: common, production: common };
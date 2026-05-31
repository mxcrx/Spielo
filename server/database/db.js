const mysql = require("mysql2/promise");
const config = require("../config");

const pool = mysql.createPool({
  host: config.dbHost,
  port: config.dbPort,
  user: config.dbUser,
  password: config.dbPassword,
  database: config.dbName,
});

module.exports = pool;

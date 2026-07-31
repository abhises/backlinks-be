require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

let connectionString = process.env.NODE_ENV === "production"
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL_DEV;

// Parse the connection string manually because mariadb driver URI parsing can be strict
const dbUrl = new URL(connectionString);
const poolConfig = {
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || '3306', 10),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.replace('/', '')
};

// PrismaMariaDb builds its own pool from this config internally - do not
// pass it a pre-built mariadb Pool instance, it gets silently discarded.
const adapter = new PrismaMariaDb(poolConfig);

const prisma = new PrismaClient({ adapter });

module.exports = prisma;

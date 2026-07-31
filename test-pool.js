require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const mariadb = require('mariadb');

let connectionString = process.env.NODE_ENV === "production"
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL_DEV;

// The mariadb driver requires the protocol to be mariadb://
if (connectionString && connectionString.startsWith('mysql://')) {
  connectionString = connectionString.replace('mysql://', 'mariadb://');
}

try {
  const pool = mariadb.createPool(connectionString);
  const adapter = new PrismaMariaDb(pool);
  const prisma = new PrismaClient({ adapter });
  console.log("Prisma client with mariadb adapter created successfully");
} catch (e) {
  console.error("Failed to create Prisma client:", e);
}

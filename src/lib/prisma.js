require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.NODE_ENV === "production"
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL_DEV;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

module.exports = prisma;

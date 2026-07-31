require('dotenv').config();
const connectionString = process.env.NODE_ENV === "production"
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL_DEV;

console.log("connectionString:", connectionString);

const dbUrl = new URL(connectionString);
const poolConfig = {
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || '3306', 10),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.replace('/', '')
};

console.log("poolConfig:", poolConfig);

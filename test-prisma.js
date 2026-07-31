const { PrismaClient } = require('@prisma/client');
try {
  const prisma = new PrismaClient({});
  console.log("Success!");
} catch (e) {
  console.error("Error: ", e);
}

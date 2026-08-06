const prisma = require('./prisma');

const isBetaMode = async () => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
  return (settings?.platformMode || 'BETA') === 'BETA';
};

module.exports = { isBetaMode };

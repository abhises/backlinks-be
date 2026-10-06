// One-off: undo the HTML entities that express-validator's .escape() stored in
// chat messages, workspace descriptions and user names.
// Dry run by default; pass --apply to write the changes.
require('dotenv/config');
const prisma = require('./src/lib/prisma');

const APPLY = process.argv.includes('--apply');

// Reverse of validator.escape(); &amp; goes last so "&amp;lt;" becomes "&lt;", not "<".
const unescape = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/').replace(/&#x5C;/g, '\\')
  .replace(/&#96;/g, '`').replace(/&amp;/g, '&');

async function fix(label, rows, field, update) {
  const changed = rows.filter(r => r[field] && unescape(r[field]) !== r[field]);
  console.log(`${label}: ${changed.length} of ${rows.length} need fixing`);
  for (const r of changed) {
    if (APPLY) await update(r.id, unescape(r[field]));
  }
  if (changed[0]) console.log(`  e.g. ${JSON.stringify(changed[0][field].slice(0, 80))} -> ${JSON.stringify(unescape(changed[0][field]).slice(0, 80))}`);
}

async function run() {
  await fix('ChatMessage.messageText',
    await prisma.chatMessage.findMany({ select: { id: true, messageText: true } }), 'messageText',
    (id, v) => prisma.chatMessage.update({ where: { id }, data: { messageText: v } }));
  await fix('Workspace.description',
    await prisma.workspace.findMany({ select: { id: true, description: true } }), 'description',
    (id, v) => prisma.workspace.update({ where: { id }, data: { description: v } }));
  await fix('User.name',
    await prisma.user.findMany({ select: { id: true, name: true } }), 'name',
    (id, v) => prisma.user.update({ where: { id }, data: { name: v } }));
  console.log(APPLY ? 'Done.' : 'Dry run only. Re-run with --apply to write changes.');
}

run().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

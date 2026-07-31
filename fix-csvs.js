const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const inputDir = path.join(__dirname, '../datacsv');
const outputDir = path.join(__dirname, '../datacsv_fixed');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Target schema order for each table based on actual MySQL columns
const schemas = {
  User: ['id', 'name', 'email', 'hashedPassword', 'role', 'language', 'resetToken', 'resetTokenExpiry', 'createdAt'],
  Workspace: ['id', 'domain', 'websiteName', 'description', 'niche', 'country', 'language', 'monthlyTraffic', 'verificationStatus', 'detectedLanguage', 'hreflangTags', 'lastVerifiedAt', 'verificationNotes', 'createdAt'],
  TeamMember: ['id', 'userId', 'workspaceId', 'role'],
  ExchangeThread: ['id', 'giverWorkspaceId', 'receiverWorkspaceId', 'stage', 'status', 'giverAccepted', 'receiverAccepted', 'rejectedByWorkspaceId', 'createdAt', 'updatedAt'],
  ChatMessage: ['id', 'threadId', 'senderUserId', 'messageText', 'timestamp'],
  LinkPlacement: ['id', 'threadId', 'giverWorkspaceId', 'receiverWorkspaceId', 'sourceUrl', 'targetUrl', 'anchorText', 'linkType', 'status', 'datePlaced'],
  Notification: ['id', 'workspaceId', 'type', 'title', 'body', 'link', 'read', 'createdAt', 'payload'],
  AdminNotification: ['id', 'title', 'description', 'createdAt'],
  SystemSettings: ['id', 'cronExpression', 'matchAmount', 'rejectLimit', 'answerTimeoutDays', 'placementTimeoutDays', 'updatedAt']
};

// Known CSV column orders for files that lost their headers
const fallbackHeaders = {
  User: ['id', 'name', 'email', 'hashedPassword', 'createdAt', 'role', 'resetToken', 'resetTokenExpiry', 'language'],
  ChatMessage: ['id', 'threadId', 'senderUserId', 'messageText', 'timestamp'],
  AdminNotification: ['id', 'type', 'title', 'body', 'read', 'createdAt']
};

const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.csv'));

for (const file of files) {
  const modelName = file.replace('.csv', '');
  if (!schemas[modelName]) continue;

  console.log(`Processing ${file}...`);
  const content = fs.readFileSync(path.join(inputDir, file), 'utf8');
  
  if (!content.trim()) {
    console.log(`- Empty file, skipping.`);
    fs.writeFileSync(path.join(outputDir, file), '');
    continue;
  }

  // Parse CSV as an array of arrays
  const records = parse(content, { skip_empty_lines: true });
  
  let csvHeaders = [];
  let dataRows = [];

  // Check if first row is a header
  const firstRow = records[0];
  if (firstRow.includes('id') || firstRow.includes('createdAt')) {
    csvHeaders = firstRow;
    dataRows = records.slice(1);
  } else {
    csvHeaders = fallbackHeaders[modelName];
    dataRows = records;
  }

  const targetSchema = schemas[modelName];

  // Map each row
  const reordered = dataRows.map(row => {
    const newRow = [];
    for (const colName of targetSchema) {
      const idx = csvHeaders.indexOf(colName);
      let val = idx >= 0 ? row[idx] : null;

      // Handle booleans
      if (val === 'true' || val === 't') val = '1';
      if (val === 'false' || val === 'f') val = '0';
      
      newRow.push(val);
    }
    return newRow;
  });

  const output = stringify(reordered, { quoted_empty: false });
  fs.writeFileSync(path.join(outputDir, file), output);
  console.log(`- Wrote ${reordered.length} rows.`);
}
console.log("Done!");

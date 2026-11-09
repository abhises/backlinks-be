// File storage for blog images.
// S3 when S3_BUCKET is set, otherwise the local ./uploads folder (handy for development).
//
// Env:
//   S3_BUCKET       bucket name
//   AWS_REGION      e.g. eu-north-1
//   S3_PUBLIC_URL   optional public base URL (CloudFront or custom domain), no trailing slash.
//                   Defaults to https://<bucket>.s3.<region>.amazonaws.com
//   S3_PREFIX       optional key prefix, default "blog/"
// Credentials come from the AWS SDK default chain: the EC2 instance role (recommended),
// or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
const fs = require('fs');
const path = require('path');

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'eu-north-1';
const PREFIX = process.env.S3_PREFIX ?? 'blog/';
const PUBLIC_BASE = (process.env.S3_PUBLIC_URL || (BUCKET ? `https://${BUCKET}.s3.${REGION}.amazonaws.com` : '')).replace(/\/$/, '');
const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads', 'blog');

let client;
function s3() {
  if (!client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    client = new S3Client({ region: REGION });
  }
  return client;
}

const usingS3 = () => !!BUCKET;

/** Stores the file and returns { key, url }. */
async function putObject(name, buffer, contentType) {
  if (usingS3()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = `${PREFIX}${name}`;
    await s3().send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return { key, url: `${PUBLIC_BASE}/${key}` };
  }
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, name), buffer);
  return { key: `local:${name}`, url: `/uploads/blog/${name}` };
}

async function deleteObject(key) {
  if (!key) return;
  if (key.startsWith('local:')) {
    fs.rm(path.join(LOCAL_DIR, path.basename(key.slice(6))), { force: true }, () => {});
    return;
  }
  if (!usingS3()) return;
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { putObject, deleteObject, usingS3 };

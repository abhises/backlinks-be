// Blog: public read endpoints + admin CRUD for posts, categories, authors, media and settings.
const path = require('path');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const storage = require('../lib/storage');
const MAX_UPLOAD = 8 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

const DEFAULT_SETTINGS = {
  intro: 'Guides, data and playbooks on earning backlinks, guest posting, niche edits and keeping your link profile clean. Written by the SERPsupport outreach and SEO team.',
  seoDescription: 'Practical guides on link building, guest posts, niche edits and backlink monitoring from the SERPsupport team.',
  pillars: [],
};

// ─── helpers ────────────────────────────────────────────────────────────────

const slugify = (s) => String(s || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);

const str = (v, max = 100000) => (typeof v === 'string' ? v.slice(0, max) : '');
const optStr = (v, max) => { const s = str(v, max).trim(); return s ? s : null; };
const arr = (v) => (Array.isArray(v) ? v : []);
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

/** Plain text of a post, for search and reading time. */
function postText(p) {
  const parts = [p.title, p.description, ...arr(p.takeaways)];
  for (const b of arr(p.body)) {
    if (b.text) parts.push(b.text);
    if (b.items) parts.push(...b.items.flat());
    if (b.rows) parts.push(...b.rows.flat());
  }
  for (const f of arr(p.faqs)) parts.push(...f);
  return parts.filter(x => typeof x === 'string').join(' ');
}
const readingTime = (p) => Math.max(1, Math.round(postText(p).split(/\s+/).filter(Boolean).length / 220));

async function uniqueSlug(model, base, excludeId) {
  const root = slugify(base) || 'untitled';
  for (let i = 0; i < 100; i++) {
    const slug = i ? `${root}-${i + 1}` : root;
    const hit = await prisma[model].findUnique({ where: { slug } });
    if (!hit || hit.id === excludeId) return slug;
  }
  return `${root}-${crypto.randomBytes(3).toString('hex')}`;
}

const AUTHOR_PUBLIC = { select: { slug: true, name: true, role: true, bio: true, avatarUrl: true, linkedinUrl: true } };
const CATEGORY_PUBLIC = { select: { slug: true, name: true } };
const CARD_SELECT = {
  id: true, slug: true, title: true, excerpt: true, coverImage: true, coverAlt: true, readMinutes: true,
  featured: true, tags: true, publishedAt: true, updatedAt: true,
  category: CATEGORY_PUBLIC, author: AUTHOR_PUBLIC,
};

async function getSettings() {
  const s = await prisma.blogSettings.findUnique({ where: { id: 'singleton' } });
  return s || prisma.blogSettings.create({ data: { id: 'singleton', ...DEFAULT_SETTINGS } });
}

const fail = (res, err, label) => {
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  if (err && err.code === 'P2002') return res.status(409).json({ error: 'That slug is already in use' });
  if (err && err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  console.error(`[blog] ${label}:`, err);
  res.status(500).json({ error: 'Server error' });
};
const httpError = (status, message) => Object.assign(new Error(message), { status });

// ─── public ─────────────────────────────────────────────────────────────────

const publishedWhere = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } });

exports.publicHome = async (req, res) => {
  try {
    const [settings, categories, authors, total] = await Promise.all([
      getSettings(),
      prisma.blogCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { posts: { where: publishedWhere() } } } },
      }),
      prisma.blogAuthor.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], ...AUTHOR_PUBLIC }),
      prisma.blogPost.count({ where: publishedWhere() }),
    ]);
    res.json({
      settings,
      total,
      categories: categories.map(({ _count, id, ...c }) => ({ ...c, count: _count.posts })),
      authors,
    });
  } catch (err) { fail(res, err, 'publicHome'); }
};

exports.publicPosts = async (req, res) => {
  try {
    const where = publishedWhere();
    if (req.query.category) where.category = { slug: String(req.query.category) };
    if (req.query.author) where.author = { slug: String(req.query.author) };
    let posts = await prisma.blogPost.findMany({
      where, orderBy: { publishedAt: 'desc' },
      select: { ...CARD_SELECT, description: true, takeaways: true, body: true, faqs: true },
    });
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q) {
      posts = posts.filter(p => [postText(p), p.excerpt, p.category?.name, p.author?.name, ...arr(p.tags)]
        .some(s => typeof s === 'string' && s.toLowerCase().includes(q)));
    }
    res.json({ posts: posts.map(({ description, takeaways, body, faqs, ...card }) => card) });
  } catch (err) { fail(res, err, 'publicPosts'); }
};

exports.publicPost = async (req, res) => {
  try {
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, ...publishedWhere() },
      include: { category: { select: { slug: true, name: true, h1: true } }, author: AUTHOR_PUBLIC, reviewer: AUTHOR_PUBLIC },
    });
    if (!post) return res.status(404).json({ error: 'Not found' });

    // Posts the body links to inline ("related" blocks)
    const relSlugs = arr(post.body).filter(b => b.type === 'related' && b.slug).map(b => b.slug);
    const [linked, sameCat, others] = await Promise.all([
      relSlugs.length ? prisma.blogPost.findMany({ where: { slug: { in: relSlugs }, ...publishedWhere() }, select: CARD_SELECT }) : [],
      post.categoryId ? prisma.blogPost.findMany({ where: { ...publishedWhere(), categoryId: post.categoryId, NOT: { id: post.id } }, orderBy: { publishedAt: 'desc' }, take: 3, select: CARD_SELECT }) : [],
      prisma.blogPost.findMany({ where: { ...publishedWhere(), NOT: { id: post.id } }, orderBy: { publishedAt: 'desc' }, take: 6, select: CARD_SELECT }),
    ]);
    const seen = new Set();
    const related = [...sameCat, ...others].filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, 3);
    res.json({ post, linked, related });
  } catch (err) { fail(res, err, 'publicPost'); }
};

exports.publicSitemap = async (req, res) => {
  try {
    const [posts, categories] = await Promise.all([
      prisma.blogPost.findMany({ where: publishedWhere(), select: { slug: true, updatedAt: true } }),
      prisma.blogCategory.findMany({ select: { slug: true } }),
    ]);
    res.json({ posts, categories });
  } catch (err) { fail(res, err, 'publicSitemap'); }
};

// ─── admin: posts ───────────────────────────────────────────────────────────

function postData(b) {
  const status = b.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
  const body = arr(b.body).filter(x => x && typeof x.type === 'string');
  const data = {
    status,
    featured: !!b.featured,
    title: str(b.title, 300).trim(),
    excerpt: str(b.excerpt),
    description: str(b.description),
    seoTitle: optStr(b.seoTitle, 300),
    seoDescription: optStr(b.seoDescription),
    coverImage: optStr(b.coverImage, 1000),
    coverAlt: optStr(b.coverAlt, 500),
    coverCaption: optStr(b.coverCaption),
    customCss: optStr(b.customCss, 200000),
    jsonLd: optStr(b.jsonLd, 200000),
    takeaways: arr(b.takeaways).map(s => str(s)).filter(Boolean),
    body,
    faqs: arr(b.faqs).filter(f => Array.isArray(f) && (f[0] || f[1])).map(([q, a]) => [str(q), str(a)]),
    sources: arr(b.sources).filter(s => s && (s.label || s.href)).map(s => ({ label: str(s.label, 500), href: str(s.href, 1000) })),
    tags: arr(b.tags).map(t => slugify(t)).filter(Boolean),
    categoryId: optStr(b.categoryId, 64),
    authorId: optStr(b.authorId, 64),
    reviewerId: optStr(b.reviewerId, 64),
  };
  const rm = int(b.readMinutes);
  data.readMinutes = rm && rm > 0 ? rm : readingTime(data);
  if (b.publishedAt) {
    const d = new Date(b.publishedAt);
    if (!isNaN(d)) data.publishedAt = d;
  }
  if (!data.title) throw httpError(400, 'Title is required');
  if (data.jsonLd) {
    try { const v = JSON.parse(data.jsonLd); if (typeof v !== 'object' || v === null) throw new Error(); }
    catch { throw httpError(400, 'JSON-LD is not valid JSON (it must be an object or an array)'); }
  }
  return data;
}

async function savePost(id, b) {
  const data = postData(b);
  data.slug = await uniqueSlug('blogPost', b.slug || data.title, id);
  if (data.status === 'PUBLISHED' && !data.publishedAt) {
    const existing = id ? await prisma.blogPost.findUnique({ where: { id }, select: { publishedAt: true } }) : null;
    data.publishedAt = existing?.publishedAt || new Date();
  }
  return prisma.$transaction(async (tx) => {
    // Only one post is featured on the blog home at a time
    if (data.featured) await tx.blogPost.updateMany({ where: { featured: true, ...(id && { NOT: { id } }) }, data: { featured: false } });
    return id ? tx.blogPost.update({ where: { id }, data }) : tx.blogPost.create({ data });
  });
}

exports.listPosts = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.categoryId) where.categoryId = String(req.query.categoryId);
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ title: { contains: q } }, { slug: { contains: q } }];
    const posts = await prisma.blogPost.findMany({
      where, orderBy: { updatedAt: 'desc' },
      select: {
        id: true, slug: true, title: true, status: true, featured: true, publishedAt: true, updatedAt: true, readMinutes: true,
        category: { select: { id: true, name: true } }, author: { select: { id: true, name: true } },
      },
    });
    res.json({ posts });
  } catch (err) { fail(res, err, 'listPosts'); }
};

exports.getPost = async (req, res) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json({ post });
  } catch (err) { fail(res, err, 'getPost'); }
};

exports.createPost = async (req, res) => {
  try { res.status(201).json({ post: await savePost(null, req.body || {}) }); }
  catch (err) { fail(res, err, 'createPost'); }
};

exports.updatePost = async (req, res) => {
  try { res.json({ post: await savePost(req.params.id, req.body || {}) }); }
  catch (err) { fail(res, err, 'updatePost'); }
};

exports.deletePost = async (req, res) => {
  try { await prisma.blogPost.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (err) { fail(res, err, 'deletePost'); }
};

// ─── admin: categories ──────────────────────────────────────────────────────

exports.listCategories = async (req, res) => {
  try {
    const categories = await prisma.blogCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { posts: true } } },
    });
    res.json({ categories });
  } catch (err) { fail(res, err, 'listCategories'); }
};

async function categoryData(b, id) {
  const name = str(b.name, 191).trim();
  if (!name) throw httpError(400, 'Name is required');
  return {
    name, h1: str(b.h1, 191).trim() || name, intro: str(b.intro), sortOrder: int(b.sortOrder) ?? 0,
    slug: await uniqueSlug('blogCategory', b.slug || name, id),
  };
}
exports.createCategory = async (req, res) => {
  try { res.status(201).json({ category: await prisma.blogCategory.create({ data: await categoryData(req.body || {}) }) }); }
  catch (err) { fail(res, err, 'createCategory'); }
};
exports.updateCategory = async (req, res) => {
  try { res.json({ category: await prisma.blogCategory.update({ where: { id: req.params.id }, data: await categoryData(req.body || {}, req.params.id) }) }); }
  catch (err) { fail(res, err, 'updateCategory'); }
};
exports.deleteCategory = async (req, res) => {
  try { await prisma.blogCategory.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (err) { fail(res, err, 'deleteCategory'); }
};

// ─── admin: authors ─────────────────────────────────────────────────────────

exports.listAuthors = async (req, res) => {
  try {
    const authors = await prisma.blogAuthor.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { posts: true } } },
    });
    res.json({ authors });
  } catch (err) { fail(res, err, 'listAuthors'); }
};

async function authorData(b, id) {
  const name = str(b.name, 191).trim();
  if (!name) throw httpError(400, 'Name is required');
  return {
    name, role: str(b.role, 191).trim(), bio: str(b.bio), sortOrder: int(b.sortOrder) ?? 0,
    avatarUrl: optStr(b.avatarUrl, 1000), linkedinUrl: optStr(b.linkedinUrl, 1000),
    slug: await uniqueSlug('blogAuthor', b.slug || name, id),
  };
}
exports.createAuthor = async (req, res) => {
  try { res.status(201).json({ author: await prisma.blogAuthor.create({ data: await authorData(req.body || {}) }) }); }
  catch (err) { fail(res, err, 'createAuthor'); }
};
exports.updateAuthor = async (req, res) => {
  try { res.json({ author: await prisma.blogAuthor.update({ where: { id: req.params.id }, data: await authorData(req.body || {}, req.params.id) }) }); }
  catch (err) { fail(res, err, 'updateAuthor'); }
};
exports.deleteAuthor = async (req, res) => {
  try { await prisma.blogAuthor.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (err) { fail(res, err, 'deleteAuthor'); }
};

// ─── admin: media ───────────────────────────────────────────────────────────

exports.listMedia = async (req, res) => {
  try { res.json({ media: await prisma.blogMedia.findMany({ orderBy: { createdAt: 'desc' } }) }); }
  catch (err) { fail(res, err, 'listMedia'); }
};

/** Body: { filename, data } where data is a base64 string or data: URL. */
exports.uploadMedia = async (req, res) => {
  try {
    const { filename = 'image', data = '', alt = '' } = req.body || {};
    const m = /^data:([^;]+);base64,(.*)$/s.exec(data);
    const mime = m ? m[1] : String(req.body.mimeType || '');
    const ext = IMAGE_TYPES[mime];
    if (!ext) return res.status(400).json({ error: 'Only JPG, PNG, WebP, GIF or AVIF images can be uploaded' });
    const buf = Buffer.from(m ? m[2] : data, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'Empty file' });
    if (buf.length > MAX_UPLOAD) return res.status(413).json({ error: 'Images must be 8 MB or smaller' });

    const base = slugify(path.parse(String(filename)).name).slice(0, 60) || 'image';
    const name = `${base}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { key, url } = await storage.putObject(name, buf, mime);

    const media = await prisma.blogMedia.create({
      data: { url, key, filename: String(filename).slice(0, 191), mimeType: mime, size: buf.length, alt: str(alt, 191) },
    });
    res.status(201).json({ media });
  } catch (err) { fail(res, err, 'uploadMedia'); }
};

exports.updateMedia = async (req, res) => {
  try { res.json({ media: await prisma.blogMedia.update({ where: { id: req.params.id }, data: { alt: str(req.body?.alt, 191) } }) }); }
  catch (err) { fail(res, err, 'updateMedia'); }
};

exports.deleteMedia = async (req, res) => {
  try {
    const media = await prisma.blogMedia.delete({ where: { id: req.params.id } });
    try { await storage.deleteObject(media.key); }
    catch (e) { console.error('[blog] could not delete stored file', media.key, e.message); }
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'deleteMedia'); }
};

// ─── admin: settings ────────────────────────────────────────────────────────

const SETTINGS_FIELDS = ['eyebrow', 'h1', 'intro', 'seoTitle', 'seoDescription', 'pillarsTitle', 'pillarsText', 'ctaTitle', 'ctaText', 'ctaButton', 'newsletterTitle', 'newsletterText'];

exports.getSettings = async (req, res) => {
  try { res.json({ settings: await getSettings() }); }
  catch (err) { fail(res, err, 'getSettings'); }
};

exports.updateSettings = async (req, res) => {
  try {
    await getSettings();
    const b = req.body || {};
    const data = {};
    for (const k of SETTINGS_FIELDS) if (typeof b[k] === 'string') data[k] = k === 'intro' || k === 'seoDescription' ? b[k] : b[k].slice(0, 191);
    if (typeof b.customCss === 'string') data.customCss = b.customCss.trim() || null;
    if (Array.isArray(b.pillars)) data.pillars = b.pillars.filter(p => p && p.title && p.href).map(p => ({ title: str(p.title, 300), href: str(p.href, 1000) }));
    res.json({ settings: await prisma.blogSettings.update({ where: { id: 'singleton' }, data }) });
  } catch (err) { fail(res, err, 'updateSettings'); }
};

exports.slugify = slugify;
exports.readingTime = readingTime;

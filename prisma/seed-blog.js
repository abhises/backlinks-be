// Seeds the blog with the starter categories, authors and articles from prisma/blog-seed.json.
// Safe to re-run: existing rows (matched by slug) are left untouched.
//   node prisma/seed-blog.js            (uses DATABASE_URL_DEV / _PROD per NODE_ENV)
require('dotenv').config();
const prisma = require('../src/lib/prisma');
const seed = require('./blog-seed.json');

async function main() {
  const catIds = {};
  for (const [i, c] of seed.categories.entries()) {
    const row = await prisma.blogCategory.upsert({
      where: { slug: c.slug }, update: {},
      create: { slug: c.slug, name: c.name, h1: c.h1, intro: c.intro, sortOrder: i },
    });
    catIds[c.slug] = row.id;
  }

  const authorIds = {};
  for (const [i, a] of seed.authors.entries()) {
    const row = await prisma.blogAuthor.upsert({
      where: { slug: a.slug }, update: {},
      create: { slug: a.slug, name: a.name, role: a.role, bio: a.bio, linkedinUrl: a.linkedin || null, sortOrder: i },
    });
    authorIds[a.slug] = row.id;
  }

  let created = 0;
  for (const p of seed.posts) {
    if (await prisma.blogPost.findUnique({ where: { slug: p.slug } })) continue;
    await prisma.blogPost.create({
      data: {
        slug: p.slug, status: 'PUBLISHED', featured: !!p.featured,
        title: p.title, excerpt: p.excerpt, description: p.description,
        coverCaption: p.coverCaption || null, readMinutes: p.readMinutes,
        takeaways: p.takeaways || [], body: p.body || [], faqs: p.faqs || [], sources: p.sources || [], tags: p.tags || [],
        categoryId: catIds[p.category] || null, authorId: authorIds[p.author] || null, reviewerId: p.reviewer ? authorIds[p.reviewer] : null,
        publishedAt: new Date(p.published + 'T09:00:00Z'),
        ...(p.updated && { updatedAt: new Date(p.updated + 'T09:00:00Z') }),
      },
    });
    created++;
  }

  const settings = await prisma.blogSettings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    await prisma.blogSettings.create({
      data: {
        id: 'singleton', eyebrow: seed.home.eyebrow, h1: seed.home.h1, intro: seed.home.intro,
        seoDescription: 'Practical guides on link building, guest posts, niche edits and backlink monitoring from the SERPsupport team.',
        pillars: seed.pillars,
      },
    });
  }

  console.log(`Blog seed done: ${seed.categories.length} categories, ${seed.authors.length} authors, ${created} new posts.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

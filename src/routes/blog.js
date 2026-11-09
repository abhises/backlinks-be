const express = require('express');
const authMiddleware = require('../middleware/auth');
const blog = require('../controllers/blog');

// Public, read-only: only published posts are returned.
const publicRouter = express.Router();
publicRouter.get('/home', blog.publicHome);
publicRouter.get('/posts', blog.publicPosts);
publicRouter.get('/posts/:slug', blog.publicPost);
publicRouter.get('/sitemap', blog.publicSitemap);

// Admin CRUD, mounted at /api/admin/blog
const adminRouter = express.Router();
adminRouter.use(authMiddleware, (req, res, next) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Access denied: Admins only' });
  next();
});

adminRouter.get('/posts', blog.listPosts);
adminRouter.post('/posts', blog.createPost);
adminRouter.get('/posts/:id', blog.getPost);
adminRouter.patch('/posts/:id', blog.updatePost);
adminRouter.delete('/posts/:id', blog.deletePost);

adminRouter.get('/categories', blog.listCategories);
adminRouter.post('/categories', blog.createCategory);
adminRouter.patch('/categories/:id', blog.updateCategory);
adminRouter.delete('/categories/:id', blog.deleteCategory);

adminRouter.get('/authors', blog.listAuthors);
adminRouter.post('/authors', blog.createAuthor);
adminRouter.patch('/authors/:id', blog.updateAuthor);
adminRouter.delete('/authors/:id', blog.deleteAuthor);

adminRouter.get('/media', blog.listMedia);
adminRouter.post('/media', blog.uploadMedia);
adminRouter.patch('/media/:id', blog.updateMedia);
adminRouter.delete('/media/:id', blog.deleteMedia);

adminRouter.get('/settings', blog.getSettings);
adminRouter.put('/settings', blog.updateSettings);

module.exports = { publicRouter, adminRouter };

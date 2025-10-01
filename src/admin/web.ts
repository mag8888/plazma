import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../lib/prisma.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dt4r1tigf',
  api_key: process.env.CLOUDINARY_API_KEY || '579625698851834',
  api_secret: process.env.CLOUDINARY_API_SECRET || '3tqNb1QPMICBTW0bTLus5HFHGQI',
});

// Configure multer for file uploads (use memory storage for Railway)
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Middleware to check admin access
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminId = req.headers['x-admin-id'] as string;
  if (adminId !== process.env.ADMIN_CHAT_ID) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Admin login page
router.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Plazma Bot Admin</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .error { color: red; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h2>🔧 Plazma Bot Admin</h2>
      <form id="loginForm">
        <div class="form-group">
          <label>Admin ID:</label>
          <input type="text" id="adminId" placeholder="Введите ваш Telegram ID" required>
        </div>
        <button type="submit">Войти</button>
        <div id="error" class="error"></div>
      </form>
      
      <script>
        document.getElementById('loginForm').addEventListener('submit', function(e) {
          e.preventDefault();
          const adminId = document.getElementById('adminId').value;
          localStorage.setItem('adminId', adminId);
          window.location.href = '/admin';
        });
        
        // Check if already logged in
        const savedAdminId = localStorage.getItem('adminId');
        if (savedAdminId) {
          window.location.href = '/admin';
        }
      </script>
    </body>
    </html>
  `);
});

// Main admin panel
router.get('/', requireAdmin, async (req, res) => {
  try {
    const stats = {
      categories: await prisma.category.count(),
      products: await prisma.product.count(),
      partners: await prisma.partnerProfile.count(),
      reviews: await prisma.review.count(),
      orders: await prisma.orderRequest.count(),
      users: await prisma.user.count(),
    };

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Plazma Bot Admin Panel</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; }
          .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
          .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
          .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
          .stat-label { color: #666; margin-top: 5px; }
          .sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
          .section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .section h3 { margin-top: 0; color: #333; }
          .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
          .btn:hover { background: #0056b3; }
          .btn-success { background: #28a745; }
          .btn-warning { background: #ffc107; color: #333; }
          .btn-danger { background: #dc3545; }
          .form-group { margin-bottom: 15px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
          .form-group textarea { height: 100px; resize: vertical; }
          .logout { position: fixed; top: 20px; right: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔧 Plazma Bot Admin Panel</h1>
            <a href="/admin/logout" class="btn btn-danger logout">Выйти</a>
          </div>

          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${stats.users}</div>
              <div class="stat-label">Пользователи</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.categories}</div>
              <div class="stat-label">Категории</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.products}</div>
              <div class="stat-label">Товары</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.partners}</div>
              <div class="stat-label">Партнёры</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.reviews}</div>
              <div class="stat-label">Отзывы</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${stats.orders}</div>
              <div class="stat-label">Заказы</div>
            </div>
          </div>

          <div class="sections">
            <div class="section">
              <h3>📁 Категории</h3>
              <a href="/admin/categories" class="btn">Управление категориями</a>
              <form action="/admin/categories" method="post">
                <div class="form-group">
                  <label>Название:</label>
                  <input type="text" name="name" required>
                </div>
                <div class="form-group">
                  <label>Слаг (URL):</label>
                  <input type="text" name="slug" required>
                </div>
                <div class="form-group">
                  <label>Описание:</label>
                  <textarea name="description"></textarea>
                </div>
                <button type="submit" class="btn btn-success">Добавить категорию</button>
              </form>
            </div>

            <div class="section">
              <h3>🛍 Товары</h3>
              <a href="/admin/products" class="btn">Управление товарами</a>
              <form action="/admin/products" method="post" enctype="multipart/form-data">
                <div class="form-group">
                  <label>Название:</label>
                  <input type="text" name="title" required>
                </div>
                <div class="form-group">
                  <label>Краткое описание:</label>
                  <textarea name="summary" required></textarea>
                </div>
                <div class="form-group">
                  <label>Полное описание:</label>
                  <textarea name="description"></textarea>
                </div>
                <div class="form-group">
                  <label>Цена (₽):</label>
                  <input type="number" name="price" step="0.01" required>
                </div>
                <div class="form-group">
                  <label>Категория:</label>
                  <select name="categoryId" required>
                    <option value="">Выберите категорию</option>
                    ${(await prisma.category.findMany()).map(cat => 
                      `<option value="${cat.id}">${cat.name}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Изображение:</label>
                  <input type="file" name="image" accept="image/*">
                </div>
                <button type="submit" class="btn btn-success">Добавить товар</button>
              </form>
            </div>

            <div class="section">
              <h3>⭐ Отзывы</h3>
              <a href="/admin/reviews" class="btn">Управление отзывами</a>
              <form action="/admin/reviews" method="post">
                <div class="form-group">
                  <label>Имя:</label>
                  <input type="text" name="name" required>
                </div>
                <div class="form-group">
                  <label>Текст отзыва:</label>
                  <textarea name="content" required></textarea>
                </div>
                <div class="form-group">
                  <label>Ссылка (опционально):</label>
                  <input type="url" name="link">
                </div>
                <div class="form-group">
                  <label>
                    <input type="checkbox" name="isPinned"> Закрепить
                  </label>
                </div>
                <button type="submit" class="btn btn-success">Добавить отзыв</button>
              </form>
            </div>

            <div class="section">
              <h3>👥 Партнёры</h3>
              <a href="/admin/partners" class="btn">Управление партнёрами</a>
              <p>Просмотр всех партнёров и их статистики</p>
            </div>

            <div class="section">
              <h3>📦 Заказы</h3>
              <a href="/admin/orders" class="btn">Управление заказами</a>
              <p>Просмотр и обработка заказов</p>
            </div>
          </div>
        </div>

        <script>
          // Add admin ID to all requests
          fetch('/admin', {
            headers: {
              'X-Admin-ID': localStorage.getItem('adminId')
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Admin panel error:', error);
    res.status(500).send('Internal server error');
  }
});

// Handle category creation
router.post('/categories', requireAdmin, async (req, res) => {
  try {
    const { name, slug, description } = req.body;
    await prisma.category.create({
      data: { name, slug, description, isActive: true }
    });
    res.redirect('/admin?success=category');
  } catch (error) {
    console.error('Category creation error:', error);
    res.redirect('/admin?error=category');
  }
});

// Handle product creation
router.post('/products', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, summary, description, price, categoryId } = req.body;
    let imageUrl = null;

    // Upload image to Cloudinary if provided
    if (req.file) {
      console.log('Uploading image to Cloudinary...');
      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream({
          folder: 'plazma-bot/products',
          transformation: [
            { width: 800, height: 600, crop: 'fill', quality: 'auto' }
          ]
        }, (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }).end(req.file!.buffer);
      });
      
      imageUrl = result.secure_url;
      console.log('Image uploaded:', imageUrl);
    }

    const product = await prisma.product.create({
      data: {
        title,
        summary,
        description,
        price: parseFloat(price),
        categoryId,
        imageUrl,
        isActive: true
      }
    });

    console.log('Product created:', product.id);
    res.redirect('/admin?success=product');
  } catch (error) {
    console.error('Product creation error:', error);
    res.redirect('/admin?error=product');
  }
});

// Handle review creation
router.post('/reviews', requireAdmin, async (req, res) => {
  try {
    const { name, content, link, isPinned } = req.body;
    await prisma.review.create({
      data: {
        name,
        content,
        link,
        isPinned: isPinned === 'on',
        isActive: true
      }
    });
    res.redirect('/admin?success=review');
  } catch (error) {
    console.error('Review creation error:', error);
    res.redirect('/admin?error=review');
  }
});

// Logout
router.get('/logout', (req, res) => {
  res.send(`
    <script>
      localStorage.removeItem('adminId');
      window.location.href = '/admin/login';
    </script>
  `);
});

export { router as adminWebRouter };

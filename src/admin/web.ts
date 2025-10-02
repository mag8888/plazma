import express from 'express';
import multer from 'multer';
import session from 'express-session';
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
  const session = req.session as any;
  if (!session.isAdmin) {
    return res.redirect('/admin/login');
  }
  next();
};

// Admin login page
router.get('/login', (req, res) => {
  const error = req.query.error;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Plazma Bot Admin</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; background: #f5f5f5; }
        .login-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: bold; color: #333; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0056b3; }
        .error { color: red; margin-top: 10px; text-align: center; }
        h2 { text-align: center; color: #333; margin-bottom: 30px; }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h2>🔧 Plazma Bot Admin</h2>
        <form method="post" action="/admin/login">
          <div class="form-group">
            <label>Пароль:</label>
            <input type="password" name="password" placeholder="Введите пароль" required>
          </div>
          <button type="submit">Войти</button>
          ${error ? '<div class="error">Неверный пароль</div>' : ''}
        </form>
      </div>
    </body>
    </html>
  `);
});

// Handle login POST request
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password === adminPassword) {
    const session = req.session as any;
    session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login?error=1');
  }
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
          .stat-card { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
            text-align: center; 
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
          }
          .stat-card:hover { 
            background: #f8f9fa; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            transform: translateY(-2px);
          }
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
            <button class="stat-card" onclick="openAdminPage('/admin/users')">
              <div class="stat-number">${stats.users}</div>
              <div class="stat-label">Пользователи</div>
            </button>
            <button class="stat-card" onclick="openAdminPage('/admin/categories')">
              <div class="stat-number">${stats.categories}</div>
              <div class="stat-label">Категории</div>
            </button>
            <button class="stat-card" onclick="openAdminPage('/admin/products')">
              <div class="stat-number">${stats.products}</div>
              <div class="stat-label">Товары</div>
            </button>
            <button class="stat-card" onclick="openAdminPage('/admin/partners')">
              <div class="stat-number">${stats.partners}</div>
              <div class="stat-label">Партнёры</div>
            </button>
            <button class="stat-card" onclick="openAdminPage('/admin/partners-network')">
              <div class="stat-number">🌐</div>
              <div class="stat-label">Сетка партнёров</div>
            </button>
            <button class="stat-card" onclick="openAdminPage('/admin/reviews')">
              <div class="stat-number">${stats.reviews}</div>
              <div class="stat-label">Отзывы</div>
            </button>
            <button class="stat-card" onclick="openAdminPage('/admin/orders')">
              <div class="stat-number">${stats.orders}</div>
              <div class="stat-label">Заказы</div>
            </button>
          </div>

          <div class="sections">
            <div class="section">
              <h3>📁 Категории</h3>
              <button onclick="openAdminPage('/admin/categories')" class="btn">Управление категориями</button>
              <form action="/admin/categories" method="post">
                <div class="form-group">
                  <label>Название:</label>
                  <input type="text" name="name" required>
                </div>
                <div class="form-group">
                  <label>Слаг (URL):</label>
                  <input type="text" name="slug">
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
              <button onclick="openAdminPage('/admin/products')" class="btn">Управление товарами</button>
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
                  <label>Цена в рублях (₽):</label>
                  <input type="number" name="price_rub" step="0.01" required placeholder="Например: 5000.00" oninput="updatePZPrice(this.value)">
                </div>
                <div class="form-group">
                  <label>Цена в PZ (автоматически):</label>
                  <input type="number" name="price" step="0.01" readonly style="background-color: #f5f5f5;">
                  <small style="color: #666;">1 PZ = 100 ₽ (курс обмена)</small>
                </div>
                <script>
                  function updatePZPrice(rubPrice) {
                    const pzPrice = rubPrice / 100;
                    document.querySelector('input[name="price"]').value = pzPrice.toFixed(2);
                  }
                </script>
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
              <button onclick="openAdminPage('/admin/reviews')" class="btn">Управление отзывами</button>
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
              <button onclick="openAdminPage('/admin/partners')" class="btn">Управление партнёрами</button>
              <p>Просмотр всех партнёров и их статистики</p>
            </div>

            <div class="section">
              <h3>📦 Заказы</h3>
              <button onclick="openAdminPage('/admin/orders')" class="btn">Управление заказами</button>
              <p>Просмотр и обработка заказов</p>
            </div>
          </div>
        </div>

        <script>
          // Function to open admin pages
          function openAdminPage(url) {
            console.log('Opening admin page:', url);
            window.location.href = url;
          }
          
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
    console.log('Creating category with data:', { name, slug, description });

    // Generate slug from name if not provided
    let finalSlug = slug;
    if (!finalSlug && name) {
      finalSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .trim();
    }

    console.log('Final slug:', finalSlug);

    const category = await prisma.category.create({
      data: { name, slug: finalSlug || name.toLowerCase(), description, isActive: true }
    });

    console.log('Category created successfully:', category.id);
    res.redirect('/admin?success=category');
  } catch (error) {
    console.error('Category creation error:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    res.redirect('/admin?error=category');
  }
});

// Handle category toggle active status
router.post('/categories/:id/toggle-active', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({ where: { id } });
    
    if (!category) {
      return res.redirect('/admin?error=category_not_found');
    }

    await prisma.category.update({
      where: { id },
      data: { isActive: !category.isActive }
    });

    res.redirect('/admin?success=category_updated');
  } catch (error) {
    console.error('Category toggle error:', error);
    res.redirect('/admin?error=category_toggle');
  }
});

// Handle category deletion
router.post('/categories/:id/delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if category has products
    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      return res.redirect('/admin?error=category_has_products');
    }

    await prisma.category.delete({ where: { id } });
    res.redirect('/admin?success=category_deleted');
  } catch (error) {
    console.error('Category deletion error:', error);
    res.redirect('/admin?error=category_delete');
  }
});

// Handle product toggle active status
router.post('/products/:id/toggle-active', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({ where: { id } });
    
    if (!product) {
      return res.redirect('/admin?error=product_not_found');
    }

    await prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive }
    });

    res.redirect('/admin?success=product_updated');
  } catch (error) {
    console.error('Product toggle error:', error);
    res.redirect('/admin?error=product_toggle');
  }
});

// Handle product image upload
router.post('/products/:id/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    console.log('🖼️ Image upload request received');
    const { id } = req.params;
    console.log('🖼️ Product ID:', id);
    
    const product = await prisma.product.findUnique({ where: { id } });
    
    if (!product) {
      console.log('🖼️ Product not found:', id);
      return res.redirect('/admin/products?error=product_not_found');
    }

    console.log('🖼️ Product found:', product.title);
    console.log('🖼️ Request file:', req.file ? 'present' : 'missing');
    
    if (!req.file) {
      console.log('🖼️ No file uploaded');
      return res.redirect('/admin/products?error=no_image');
    }

    console.log('🖼️ File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    console.log('🖼️ Uploading to Cloudinary...');
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'plazma-bot/products',
          transformation: [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }],
        },
        (error, result) => {
          if (error) {
            console.error('🖼️ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('🖼️ Cloudinary upload success:', result?.secure_url);
            resolve(result);
          }
        },
      ).end(req.file!.buffer);
    });

    const imageUrl = result.secure_url;
    console.log('🖼️ Final image URL:', imageUrl);

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { imageUrl }
    });

    console.log('🖼️ Database updated, product imageUrl:', updatedProduct.imageUrl);
    res.redirect('/admin/products?success=image_updated');
  } catch (error) {
    console.error('🖼️ Product image upload error:', error);
    res.redirect('/admin/products?error=image_upload');
  }
});

// Handle product deletion
router.post('/products/:id/delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove from all carts first
    await prisma.cartItem.deleteMany({ where: { productId: id } });
    
    await prisma.product.delete({ where: { id } });
    res.redirect('/admin?success=product_deleted');
  } catch (error) {
    console.error('Product deletion error:', error);
    res.redirect('/admin?error=product_delete');
  }
});

// Handle review toggle active status
router.post('/reviews/:id/toggle-active', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const review = await prisma.review.findUnique({ where: { id } });
    
    if (!review) {
      return res.redirect('/admin?error=review_not_found');
    }

    await prisma.review.update({
      where: { id },
      data: { isActive: !review.isActive }
    });

    res.redirect('/admin?success=review_updated');
  } catch (error) {
    console.error('Review toggle error:', error);
    res.redirect('/admin?error=review_toggle');
  }
});

// Handle review toggle pinned status
router.post('/reviews/:id/toggle-pinned', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const review = await prisma.review.findUnique({ where: { id } });
    
    if (!review) {
      return res.redirect('/admin?error=review_not_found');
    }

    await prisma.review.update({
      where: { id },
      data: { isPinned: !review.isPinned }
    });

    res.redirect('/admin?success=review_updated');
  } catch (error) {
    console.error('Review toggle pinned error:', error);
    res.redirect('/admin?error=review_toggle');
  }
});

// Handle review image upload
router.post('/reviews/:id/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    console.log('🖼️ Review image upload request received');
    const { id } = req.params;
    console.log('🖼️ Review ID:', id);
    
    const review = await prisma.review.findUnique({ where: { id } });
    
    if (!review) {
      console.log('🖼️ Review not found:', id);
      return res.redirect('/admin/reviews?error=review_not_found');
    }

    console.log('🖼️ Review found:', review.name);
    console.log('🖼️ Request file:', req.file ? 'present' : 'missing');
    
    if (!req.file) {
      console.log('🖼️ No file uploaded');
      return res.redirect('/admin/reviews?error=no_image');
    }

    console.log('🖼️ File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    console.log('🖼️ Uploading to Cloudinary...');
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'plazma-bot/reviews',
          transformation: [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }],
        },
        (error, result) => {
          if (error) {
            console.error('🖼️ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('🖼️ Cloudinary upload success:', result?.secure_url);
            resolve(result);
          }
        },
      ).end(req.file!.buffer);
    });

    const imageUrl = result.secure_url;
    console.log('🖼️ Final image URL:', imageUrl);

    const updatedReview = await prisma.review.update({
      where: { id },
      data: { photoUrl: imageUrl }
    });

    console.log('🖼️ Database updated, review photoUrl:', updatedReview.photoUrl);
    res.redirect('/admin/reviews?success=image_updated');
  } catch (error) {
    console.error('🖼️ Review image upload error:', error);
    res.redirect('/admin/reviews?error=image_upload');
  }
});

// Handle review deletion
router.post('/reviews/:id/delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.review.delete({ where: { id } });
    res.redirect('/admin?success=review_deleted');
  } catch (error) {
    console.error('Review deletion error:', error);
    res.redirect('/admin?error=review_delete');
  }
});

// Handle partner inviter change
router.post('/partners/:id/change-inviter', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newInviterCode } = req.body;
    
    // Find the new inviter by referral code
    const newInviter = await prisma.partnerProfile.findUnique({
      where: { referralCode: newInviterCode },
      include: { user: true }
    });
    
    if (!newInviter) {
      return res.redirect('/admin/partners?error=inviter_not_found');
    }
    
    // Find current partner
    const currentPartner = await prisma.partnerProfile.findUnique({
      where: { id },
      include: { user: true }
    });
    
    if (!currentPartner) {
      return res.redirect('/admin/partners?error=partner_not_found');
    }
    
    // Delete old referral if exists
    await prisma.partnerReferral.deleteMany({
      where: { referredId: currentPartner.userId }
    });
    
    // Create new referral
    await prisma.partnerReferral.create({
      data: {
        profileId: newInviter.id,
        referredId: currentPartner.userId,
        level: 1
      }
    });
    
    res.redirect('/admin/partners?success=inviter_changed');
  } catch (error) {
    console.error('Change inviter error:', error);
    res.redirect('/admin/partners?error=inviter_change');
  }
});

// Handle user inviter change
router.post('/users/:id/change-inviter', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newInviterCode } = req.body;
    
    // Find the new inviter by referral code
    const newInviter = await prisma.partnerProfile.findUnique({
      where: { referralCode: newInviterCode },
      include: { user: true }
    });
    
    if (!newInviter) {
      return res.redirect('/admin/users?error=inviter_not_found');
    }
    
    // Find current user
    const currentUser = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!currentUser) {
      return res.redirect('/admin/users?error=user_not_found');
    }
    
    // Delete old referral if exists
    await prisma.partnerReferral.deleteMany({
      where: { referredId: id }
    });
    
    // Create new referral
    await prisma.partnerReferral.create({
      data: {
        profileId: newInviter.id,
        referredId: id,
        level: 1
      }
    });
    
    res.redirect('/admin/users?success=inviter_changed');
  } catch (error) {
    console.error('Change user inviter error:', error);
    res.redirect('/admin/users?error=inviter_change');
  }
});

// Handle user deletion
router.post('/users/:id/delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete related data first
    await prisma.cartItem.deleteMany({ where: { userId: id } });
    await prisma.orderRequest.deleteMany({ where: { userId: id } });
    await prisma.userHistory.deleteMany({ where: { userId: id } });
    
    // Delete partner profile and referrals if exists
    const partnerProfile = await prisma.partnerProfile.findUnique({ where: { userId: id } });
    if (partnerProfile) {
      await prisma.partnerReferral.deleteMany({ where: { profileId: partnerProfile.id } });
      await prisma.partnerReferral.deleteMany({ where: { referredId: id } });
      await prisma.partnerProfile.delete({ where: { userId: id } });
    }
    
    // Delete user
    await prisma.user.delete({ where: { id } });
    
    res.redirect('/admin/users?success=user_deleted');
  } catch (error) {
    console.error('User deletion error:', error);
    res.redirect('/admin/users?error=user_delete');
  }
});

// Handle order status update
router.post('/orders/:id/update-status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await prisma.orderRequest.update({
      where: { id },
      data: { status }
    });

    res.redirect('/admin?success=order_updated');
  } catch (error) {
    console.error('Order status update error:', error);
    res.redirect('/admin?error=order_update');
  }
});

// Handle order deletion
router.post('/orders/:id/delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.orderRequest.delete({ where: { id } });
    res.redirect('/admin?success=order_deleted');
  } catch (error) {
    console.error('Order deletion error:', error);
    res.redirect('/admin?error=order_delete');
  }
});

// Handle product creation
router.post('/products', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, summary, description, price_rub, categoryId } = req.body;

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    const trimmedSummary = typeof summary === 'string' ? summary.trim() : '';
    const trimmedCategoryId = typeof categoryId === 'string' ? categoryId.trim() : '';

    if (!trimmedTitle || !trimmedSummary || !trimmedCategoryId) {
      console.warn('Product creation validation failed:', { trimmedTitle, trimmedSummary, trimmedCategoryId });
      return res.redirect('/admin?error=product_validation');
    }

    console.log('Product creation request body:', {
      ...req.body,
      title: trimmedTitle,
      summary: trimmedSummary,
      categoryId: trimmedCategoryId,
    });
    console.log('Category ID:', trimmedCategoryId);
    console.log('Price RUB:', price_rub);

    // Convert RUB to PZ (1 PZ = 100 RUB)
    const rubPriceRaw = typeof price_rub === 'string' ? price_rub.replace(',', '.').trim() : '';
    const rubPrice = Number.parseFloat(rubPriceRaw) || 0;
    const pzPrice = Number.isFinite(rubPrice) ? rubPrice / 100 : 0;
    
    console.log('Creating product with RUB price:', rubPrice, 'PZ price:', pzPrice);
    let imageUrl = null;

    // Upload image to Cloudinary if provided
    if (req.file) {
      console.log('Uploading image to Cloudinary...');
      try {
        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: 'plazma-bot/products',
              transformation: [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }],
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            },
          ).end(req.file!.buffer);
        });

        imageUrl = result.secure_url;
        console.log('Image uploaded:', imageUrl);
      } catch (uploadError) {
        // Continue without blocking product creation if Cloudinary is unavailable
        console.error('Cloudinary upload error, continuing without image:', uploadError);
      }
    }

    const product = await prisma.product.create({
      data: {
        title: trimmedTitle,
        summary: trimmedSummary,
        description,
        price: Number.isFinite(pzPrice) ? Number(pzPrice.toFixed(2)) : 0, // Use converted PZ price
        categoryId: trimmedCategoryId,
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

// Test route to verify admin routing works
router.get('/test', (req, res) => {
  res.json({ status: 'Admin routes working', timestamp: new Date().toISOString() });
});

// Partner network management
router.get('/partners-network', requireAdmin, async (req, res) => {
  try {
    // Get all users with partner profiles
    const usersWithPartners = await prisma.user.findMany({
      include: {
        partner: {
          include: {
            referrals: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Build network tree
    const buildNetworkTree = (userId: string, level: number = 0): string => {
      const user = usersWithPartners.find(u => u.id === userId);
      if (!user || !user.partner) return '';

      let html = '';
      const indent = '  '.repeat(level);
      
      html += `${indent}👤 ${user.firstName || 'Пользователь'} (@${user.username || user.telegramId})\n`;
      
      if (user.partner.referrals.length > 0) {
        html += `${indent}└── Партнёры:\n`;
        user.partner.referrals.forEach((referral: any) => {
          html += buildNetworkTree(referral.referredId, level + 1);
        });
      }
      
      return html;
    };

    let networkHtml = '';
    usersWithPartners.forEach(user => {
      if (user.partner) {
        networkHtml += buildNetworkTree(user.id) + '\n';
      }
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Сетка партнёров</title>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Courier New', monospace; max-width: 1000px; margin: 20px auto; padding: 20px; }
          .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
          .btn:hover { background: #0056b3; }
          .network { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; white-space: pre-line; }
        </style>
      </head>
      <body>
        <h2>🌐 Сетка партнёров</h2>
        <a href="/admin" class="btn">← Назад</a>
        <a href="/admin/partners" class="btn">📊 Партнёры</a>
        
        <div class="network">
          <h3>Дерево партнёрской сети:</h3>
          ${networkHtml || 'Партнёрская сеть пуста'}
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Partners network error:', error);
    res.status(500).send('Ошибка загрузки сетки партнёров');
  }
});

// Individual admin pages
router.get('/users', requireAdmin, async (req, res) => {
  try {
    console.log('👥 Admin users page accessed');
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to last 50 users
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Управление пользователями</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 1000px; margin: 20px auto; padding: 20px; }
          .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
          .btn:hover { background: #0056b3; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>👥 Управление пользователями</h2>
        <a href="/admin" class="btn">← Назад</a>
        
        ${req.query.success === 'user_deleted' ? '<div class="alert alert-success">✅ Пользователь успешно удален</div>' : ''}
        ${req.query.error === 'user_delete' ? '<div class="alert alert-error">❌ Ошибка при удалении пользователя</div>' : ''}
        ${req.query.success === 'inviter_changed' ? '<div class="alert alert-success">✅ Пригласитель успешно изменен</div>' : ''}
        ${req.query.error === 'inviter_not_found' ? '<div class="alert alert-error">❌ Пригласитель с таким кодом не найден</div>' : ''}
        ${req.query.error === 'inviter_change' ? '<div class="alert alert-error">❌ Ошибка при смене пригласителя</div>' : ''}
        
        <style>
          .delete-btn { background: #f87171; color: #7f1d1d; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
          .delete-btn:hover { background: #ef4444; }
          .change-inviter-btn { background: #10b981; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 5px; }
          .change-inviter-btn:hover { background: #059669; }
          .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
          .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
        <table>
          <tr><th>ID</th><th>Telegram ID</th><th>Имя</th><th>Username</th><th>Чей реферал</th><th>Зарегистрирован</th><th>Активность</th><th>Действия</th></tr>
    `;

    // Get referral information for all users
    const referrals = await prisma.partnerReferral.findMany({
      include: {
        profile: {
          include: {
            user: true
          }
        }
      }
    });

    // Get all available partners for dropdown
    const availablePartners = await prisma.partnerProfile.findMany({
      include: {
        user: true
      },
      orderBy: {
        user: {
          firstName: 'asc'
        }
      }
    });

    users.forEach(user => {
      // Find who invited this user
      const referral = referrals.find(r => r.referredId === user.id);
      const inviterInfo = referral ? `${referral.profile.user.firstName || 'Не указано'} (@${referral.profile.user.username || referral.profile.user.telegramId})` : 'Нет пригласителя';
      
      html += `
        <tr>
          <td>${user.id.slice(0, 8)}...</td>
          <td>${user.telegramId}</td>
          <td>${user.firstName || 'Не указано'}</td>
          <td>${user.username ? '@' + user.username : 'Не указано'}</td>
          <td>
            ${inviterInfo}
            <div style="margin-top: 5px;">
              <form method="post" action="/admin/users/${user.id}/change-inviter" style="display: inline;">
                <select name="newInviterCode" style="width: 140px; padding: 4px; font-size: 11px;" required>
                  <option value="">Выберите пригласителя</option>
                  ${availablePartners.map(partner => `
                    <option value="${partner.referralCode}">${partner.user.firstName || 'Пользователь'} (${partner.referralCode})</option>
                  `).join('')}
                </select>
                <button type="submit" class="change-inviter-btn" onclick="return confirm('Изменить пригласителя для ${user.firstName || user.telegramId}?')" style="padding: 4px 8px; font-size: 11px;">🔄</button>
              </form>
            </div>
          </td>
          <td>${new Date(user.createdAt).toLocaleDateString()}</td>
          <td>${user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'Нет данных'}</td>
          <td>
            <form method="post" action="/admin/users/${user.id}/delete" onsubmit="return confirm('Удалить пользователя «${user.firstName || user.telegramId}»?')" style="display: inline;">
              <button type="submit" class="delete-btn">🗑️ Удалить</button>
            </form>
          </td>
        </tr>
      `;
    });

    html += `
        </table>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Users page error:', error);
    res.status(500).send('Ошибка загрузки пользователей');
  }
});

router.get('/categories', requireAdmin, async (req, res) => {
  try {
    console.log('📁 Admin categories page accessed');
    const categories = await prisma.category.findMany({
      orderBy: { createdAt: 'desc' }
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Управление категориями</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 1000px; margin: 20px auto; padding: 20px; }
          .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
          .btn:hover { background: #0056b3; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
          .status-btn { transition: all 0.2s ease; }
          .status-btn:hover { transform: scale(1.1); }
          .status-btn.active { color: #28a745; }
          .status-btn.inactive { color: #dc3545; }
        </style>
      </head>
      <body>
        <h2>📁 Управление категориями</h2>
        <a href="/admin" class="btn">← Назад</a>
        <table>
          <tr><th>ID</th><th>Название</th><th>Слаг</th><th>Статус</th><th>Создана</th></tr>
    `;

    categories.forEach(cat => {
      html += `
        <tr>
          <td>${cat.id.substring(0, 8)}...</td>
          <td>${cat.name}</td>
          <td>${cat.slug}</td>
          <td>
            <form method="post" action="/admin/categories/${cat.id}/toggle-active" style="display: inline;">
              <button type="submit" class="status-btn ${cat.isActive ? 'active' : 'inactive'}" style="border: none; background: none; cursor: pointer; font-size: 16px;">
                ${cat.isActive ? '✅ Активна' : '❌ Неактивна'}
              </button>
            </form>
          </td>
          <td>${new Date(cat.createdAt).toLocaleDateString()}</td>
        </tr>
      `;
    });

    html += `
        </table>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Categories page error:', error);
    res.status(500).send('Ошибка загрузки категорий');
  }
});

router.get('/partners', requireAdmin, async (req, res) => {
  try {
    const partners = await prisma.partnerProfile.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Управление партнёрами</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 1000px; margin: 20px auto; padding: 20px; }
          .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
          .btn:hover { background: #0056b3; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>👥 Управление партнёрами</h2>
        <a href="/admin" class="btn">← Назад</a>
        
        ${req.query.success === 'inviter_changed' ? '<div class="alert alert-success">✅ Пригласитель успешно изменен</div>' : ''}
        ${req.query.error === 'inviter_not_found' ? '<div class="alert alert-error">❌ Пригласитель с таким кодом не найден</div>' : ''}
        ${req.query.error === 'inviter_change' ? '<div class="alert alert-error">❌ Ошибка при смене пригласителя</div>' : ''}
        <style>
          .change-inviter-btn { background: #10b981; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 5px; }
          .change-inviter-btn:hover { background: #059669; }
          .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
          .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
        <table>
          <tr><th>Пользователь</th><th>Тип программы</th><th>Баланс</th><th>Партнёров</th><th>Код</th><th>Пригласитель</th><th>Создан</th><th>Действия</th></tr>
    `;

    partners.forEach(partner => {
      html += `
        <tr>
          <td>${partner.user.firstName || 'Не указан'}</td>
          <td>${partner.programType === 'DIRECT' ? 'Прямая (25%)' : 'Многоуровневая (15%+5%+5%)'}</td>
          <td>${partner.balance} PZ</td>
          <td>${partner.totalPartners}</td>
          <td>${partner.referralCode}</td>
          <td>Нет данных</td>
          <td>${new Date(partner.createdAt).toLocaleDateString()}</td>
          <td>
            <form method="post" action="/admin/partners/${partner.id}/change-inviter" style="display: inline;">
              <input type="text" name="newInviterCode" placeholder="Код пригласителя" style="width: 120px; padding: 4px;" required>
              <button type="submit" class="change-inviter-btn" onclick="return confirm('Изменить пригласителя для ${partner.user.firstName || 'пользователя'}?')">🔄</button>
            </form>
          </td>
        </tr>
      `;
    });

    html += `
        </table>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Partners page error:', error);
    res.status(500).send('Ошибка загрузки партнёров');
  }
});

router.get('/products', requireAdmin, async (req, res) => {
  try {
    console.log('🛍️ Admin products page accessed');
    const categories = await prisma.category.findMany({
      include: {
        products: {
          include: { category: true },
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    const allProducts = categories.flatMap((category) => category.products.map((product) => ({
      ...product,
      categoryName: category.name,
    })));

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Управление товарами</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 1200px; margin: 20px auto; padding: 20px; background: #f5f5f5; }
          a.btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; margin: 5px 0 20px; transition: background 0.2s ease; }
          a.btn:hover { background: #0056b3; }
          h2 { margin-top: 0; }
          .filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
          .filter-btn { padding: 8px 16px; border: none; border-radius: 999px; background: #e0e7ff; color: #1d4ed8; cursor: pointer; transition: all 0.2s ease; }
          .filter-btn:hover { background: #c7d2fe; }
          .filter-btn.active { background: #1d4ed8; color: #fff; box-shadow: 0 4px 10px rgba(29, 78, 216, 0.2); }
          .product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
          .product-card { background: #fff; border-radius: 12px; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08); padding: 18px; display: flex; flex-direction: column; gap: 12px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
          .product-card:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12); }
          .product-header { display: flex; justify-content: space-between; align-items: flex-start; }
          .product-title { font-size: 18px; font-weight: 600; color: #111827; margin: 0; }
          .badge { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-block; }
          .badge-status-active { background: #dcfce7; color: #166534; }
          .badge-status-inactive { background: #fee2e2; color: #991b1b; }
          .status-btn { transition: all 0.2s ease; }
          .status-btn:hover { transform: scale(1.1); }
          .status-btn.active { color: #28a745; }
          .status-btn.inactive { color: #dc3545; }
          .badge-category { background: #e5e7eb; color: #374151; }
          .product-summary { color: #4b5563; font-size: 14px; line-height: 1.5; margin: 0; }
          .product-price { font-size: 16px; font-weight: 600; color: #1f2937; }
          .product-meta { font-size: 12px; color: #6b7280; display: flex; justify-content: space-between; }
          .product-actions { display: flex; gap: 10px; }
          .product-actions form { margin: 0; }
          .product-actions button { padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
          .product-actions .toggle-btn { background: #fbbf24; color: #92400e; }
          .product-actions .toggle-btn:hover { background: #f59e0b; }
          .product-actions .delete-btn { background: #f87171; color: #7f1d1d; }
          .product-actions .delete-btn:hover { background: #ef4444; }
          .product-actions .image-btn { background: #10b981; color: #064e3b; }
          .product-actions .image-btn:hover { background: #059669; }
          .empty-state { text-align: center; padding: 60px 20px; color: #6b7280; background: #fff; border-radius: 12px; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08); }
          img.product-image { width: 100%; height: 200px; object-fit: cover; border-radius: 10px; }
          .product-image-placeholder { 
            width: 100%; 
            height: 200px; 
            border: 2px dashed #d1d5db; 
            border-radius: 10px; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            background: #f9fafb; 
            color: #6b7280; 
          }
          .placeholder-icon { font-size: 32px; margin-bottom: 8px; }
          .placeholder-text { font-size: 14px; font-weight: 500; }
          .alert { padding: 12px 16px; margin: 16px 0; border-radius: 8px; font-weight: 500; }
          .alert-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
          .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        </style>
      </head>
      <body>
        <h2>🛍 Управление товарами</h2>
        <a href="/admin" class="btn">← Назад</a>
        
        ${req.query.success === 'image_updated' ? '<div class="alert alert-success">✅ Фото успешно обновлено!</div>' : ''}
        ${req.query.error === 'no_image' ? '<div class="alert alert-error">❌ Файл не выбран</div>' : ''}
        ${req.query.error === 'image_upload' ? '<div class="alert alert-error">❌ Ошибка загрузки фото</div>' : ''}
        ${req.query.error === 'product_not_found' ? '<div class="alert alert-error">❌ Товар не найден</div>' : ''}

        <div class="filters">
          <button type="button" class="filter-btn active" data-filter="all">Все категории (${allProducts.length})</button>
    `;

    categories.forEach((category) => {
      html += `
          <button type="button" class="filter-btn" data-filter="${category.id}">${category.name} (${category.products.length})</button>
      `;
    });

    html += `
        </div>

        <div class="product-grid">
    `;

    if (allProducts.length === 0) {
      html += `
          <div class="empty-state">
            <h3>Пока нет добавленных товаров</h3>
            <p>Используйте форму на главной странице админки, чтобы добавить первый товар.</p>
          </div>
        </div>
      </body>
      </html>
      `;
      return res.send(html);
    }

    allProducts.forEach((product) => {
      const rubPrice = (product.price * 100).toFixed(2);
      const priceFormatted = `${rubPrice} ₽ / ${product.price.toFixed(2)} PZ`;
      const createdAt = new Date(product.createdAt).toLocaleDateString();
      const imageSection = product.imageUrl
        ? `<img src="${product.imageUrl}" alt="${product.title}" class="product-image" loading="lazy">`
        : `<div class="product-image-placeholder">
             <span class="placeholder-icon">📷</span>
             <span class="placeholder-text">Нет фото</span>
           </div>`;

      html += `
          <div class="product-card" data-category="${product.categoryId}">
            ${imageSection}
            <div class="product-header">
              <h3 class="product-title">${product.title}</h3>
              <form method="post" action="/admin/products/${product.id}/toggle-active" style="display: inline;">
                <button type="submit" class="status-btn ${product.isActive ? 'active' : 'inactive'}" style="border: none; background: none; cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 4px;">
                  ${product.isActive ? '✅ Активен' : '❌ Неактивен'}
                </button>
              </form>
            </div>
            <span class="badge badge-category">${product.categoryName}</span>
            <p class="product-summary">${product.summary}</p>
            <div class="product-price">${priceFormatted}</div>
            <div class="product-meta">
              <span>Создан: ${createdAt}</span>
              <span>ID: ${product.id.slice(0, 8)}...</span>
            </div>
            <div class="product-actions">
              <form method="post" action="/admin/products/${product.id}/toggle-active">
                <button type="submit" class="toggle-btn">${product.isActive ? 'Отключить' : 'Включить'}</button>
              </form>
              <form method="post" action="/admin/products/${product.id}/upload-image" enctype="multipart/form-data" style="display: inline;">
                <input type="file" name="image" accept="image/*" style="display: none;" id="image-${product.id}" onchange="this.form.submit()">
                <button type="button" class="image-btn" onclick="document.getElementById('image-${product.id}').click()">📷 ${product.imageUrl ? 'Изменить фото' : 'Добавить фото'}</button>
              </form>
              <form method="post" action="/admin/products/${product.id}/delete" onsubmit="return confirm('Удалить товар «${product.title}»?')">
                <button type="submit" class="delete-btn">Удалить</button>
              </form>
            </div>
          </div>
      `;
    });

    html += `
        </div>

        <script>
          const filterButtons = document.querySelectorAll('.filter-btn');
          const cards = document.querySelectorAll('.product-card');

          filterButtons.forEach((button) => {
            button.addEventListener('click', () => {
              const filter = button.dataset.filter;

              filterButtons.forEach((btn) => btn.classList.remove('active'));
              button.classList.add('active');

              cards.forEach((card) => {
                if (filter === 'all' || card.dataset.category === filter) {
                  card.style.display = 'flex';
                } else {
                  card.style.display = 'none';
                }
              });
            });
          });
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Products page error:', error);
    res.status(500).send('Ошибка загрузки товаров');
  }
});

router.get('/reviews', requireAdmin, async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' }
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Управление отзывами</title>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; margin-bottom: 20px; }
          .btn:hover { background: #0056b3; }
          .review-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; margin-top: 20px; }
          .review-card { background: #fff; border-radius: 12px; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08); padding: 18px; display: flex; flex-direction: column; gap: 12px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
          .review-card:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12); }
          .review-header { display: flex; justify-content: space-between; align-items: flex-start; }
          .review-name { font-size: 18px; font-weight: 600; color: #111827; margin: 0; }
          .review-badges { display: flex; gap: 8px; }
          .badge { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; display: inline-block; }
          .badge-pinned { background: #fef3c7; color: #92400e; }
          .badge-not-pinned { background: #f3f4f6; color: #374151; }
          .review-content { color: #4b5563; font-size: 14px; line-height: 1.5; margin: 0; }
          .review-meta { font-size: 12px; color: #6b7280; display: flex; justify-content: space-between; }
          .review-actions { display: flex; gap: 10px; flex-wrap: wrap; }
          .review-actions form { margin: 0; }
          .review-actions button { padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
          .review-actions .toggle-btn { background: #fbbf24; color: #92400e; }
          .review-actions .toggle-btn:hover { background: #f59e0b; }
          .review-actions .image-btn { background: #10b981; color: #064e3b; }
          .review-actions .image-btn:hover { background: #059669; }
          .review-actions .delete-btn { background: #f87171; color: #7f1d1d; }
          .review-actions .delete-btn:hover { background: #ef4444; }
          .status-btn { transition: all 0.2s ease; }
          .status-btn:hover { transform: scale(1.1); }
          .status-btn.active { color: #28a745; }
          .status-btn.inactive { color: #dc3545; }
          img.review-image { width: 100%; height: 200px; object-fit: cover; border-radius: 10px; }
          .review-image-placeholder { 
            width: 100%; 
            height: 200px; 
            border: 2px dashed #d1d5db; 
            border-radius: 10px; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            background: #f9fafb; 
            color: #6b7280; 
          }
          .placeholder-icon { font-size: 32px; margin-bottom: 8px; }
          .placeholder-text { font-size: 14px; font-weight: 500; }
          .alert { padding: 12px 16px; margin: 16px 0; border-radius: 8px; font-weight: 500; }
          .alert-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
          .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        </style>
      </head>
      <body>
        <h2>⭐ Управление отзывами</h2>
        <a href="/admin" class="btn">← Назад</a>
        
        ${req.query.success === 'image_updated' ? '<div class="alert alert-success">✅ Фото успешно обновлено!</div>' : ''}
        ${req.query.error === 'no_image' ? '<div class="alert alert-error">❌ Файл не выбран</div>' : ''}
        ${req.query.error === 'image_upload' ? '<div class="alert alert-error">❌ Ошибка загрузки фото</div>' : ''}
        ${req.query.error === 'review_not_found' ? '<div class="alert alert-error">❌ Отзыв не найден</div>' : ''}
        
        <div class="review-grid">
    `;

    reviews.forEach(review => {
      const imageSection = review.photoUrl
        ? `<img src="${review.photoUrl}" alt="${review.name}" class="review-image" loading="lazy">`
        : `<div class="review-image-placeholder">
             <span class="placeholder-icon">👤</span>
             <span class="placeholder-text">Нет фото</span>
           </div>`;

      html += `
        <div class="review-card">
          ${imageSection}
          <div class="review-header">
            <h3 class="review-name">${review.name}</h3>
            <form method="post" action="/admin/reviews/${review.id}/toggle-active" style="display: inline;">
              <button type="submit" class="status-btn ${review.isActive ? 'active' : 'inactive'}" style="border: none; background: none; cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 4px;">
                ${review.isActive ? '✅ Активен' : '❌ Неактивен'}
              </button>
            </form>
          </div>
          <div class="review-badges">
            <span class="badge ${review.isPinned ? 'badge-pinned' : 'badge-not-pinned'}">${review.isPinned ? '📌 Закреплён' : '❌ Не закреплён'}</span>
          </div>
          <p class="review-content">${review.content}</p>
          <div class="review-meta">
            <span>Создан: ${new Date(review.createdAt).toLocaleDateString()}</span>
            <span>ID: ${review.id.slice(0, 8)}...</span>
          </div>
          <div class="review-actions">
            <form method="post" action="/admin/reviews/${review.id}/toggle-pinned">
              <button type="submit" class="toggle-btn">${review.isPinned ? 'Открепить' : 'Закрепить'}</button>
            </form>
            <form method="post" action="/admin/reviews/${review.id}/upload-image" enctype="multipart/form-data" style="display: inline;">
              <input type="file" name="image" accept="image/*" style="display: none;" id="review-image-${review.id}" onchange="this.form.submit()">
              <button type="button" class="image-btn" onclick="document.getElementById('review-image-${review.id}').click()">📷 ${review.photoUrl ? 'Изменить фото' : 'Добавить фото'}</button>
            </form>
            <form method="post" action="/admin/reviews/${review.id}/delete" onsubmit="return confirm('Удалить отзыв от «${review.name}»?')">
              <button type="submit" class="delete-btn">Удалить</button>
            </form>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Reviews page error:', error);
    res.status(500).send('Ошибка загрузки отзывов');
  }
});

router.get('/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await prisma.orderRequest.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Управление заказами</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 1000px; margin: 20px auto; padding: 20px; }
          .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
          .btn:hover { background: #0056b3; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>📦 Управление заказами</h2>
        <a href="/admin" class="btn">← Назад</a>
        <table>
          <tr><th>ID</th><th>Пользователь</th><th>Статус</th><th>Контакт</th><th>Сообщение</th><th>Создан</th></tr>
    `;

    orders.forEach(order => {
      html += `
        <tr>
          <td>${order.id.substring(0, 8)}...</td>
          <td>${order.user?.firstName || 'Не указан'}</td>
          <td>${order.status}</td>
          <td>${order.contact || 'Не указан'}</td>
          <td>${order.message.substring(0, 50)}${order.message.length > 50 ? '...' : ''}</td>
          <td>${new Date(order.createdAt).toLocaleDateString()}</td>
        </tr>
      `;
    });

    html += `
        </table>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Orders page error:', error);
    res.status(500).send('Ошибка загрузки заказов');
  }
});

// Logout
router.get('/logout', (req, res) => {
  const session = req.session as any;
  session.isAdmin = false;
  res.redirect('/admin/login');
});

export { router as adminWebRouter };

import express from 'express';
import multer from 'multer';
import session from 'express-session';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../lib/prisma.js';
import { recalculatePartnerBonuses } from '../services/partner-service.js';

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
    // Calculate total balance of all partners
    const partners = await prisma.partnerProfile.findMany({
      select: { balance: true, bonus: true }
    });
    const totalBalance = partners.reduce((sum, partner) => sum + partner.balance + partner.bonus, 0);

    const stats = {
      categories: await prisma.category.count(),
      products: await prisma.product.count(),
      partners: await prisma.partnerProfile.count(),
      reviews: await prisma.review.count(),
      orders: await prisma.orderRequest.count(),
      users: await prisma.user.count(),
      totalBalance: totalBalance,
    };

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Админ-панель Plazma Water v2.0</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .tabs { display: flex; border-bottom: 2px solid #e9ecef; margin-bottom: 30px; }
          .tab { padding: 15px 25px; background: none; border: none; cursor: pointer; font-size: 16px; color: #6c757d; border-bottom: 3px solid transparent; transition: all 0.3s; }
          .tab.active { color: #007bff; border-bottom-color: #007bff; font-weight: 600; }
          .tab:hover { color: #007bff; background: #f8f9fa; }
          .tab-content { display: none; }
          .tab-content.active { display: block; }
          .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
          .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.3s; }
          .stat-card:hover { background: #e9ecef; transform: translateY(-2px); }
          .stat-number { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 5px; }
          .stat-label { color: #6c757d; font-size: 0.9em; }
          .btn { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }
          .btn:hover { background: #0056b3; }
          .section-header { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
          .section-title { font-size: 24px; font-weight: 600; color: #333; }
          .action-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Админ-панель Plazma Water v2.0</h1>
            <p>Единое управление ботом, пользователями и партнёрами</p>
          </div>
          
          <div class="tabs">
            <button class="tab active" onclick="switchTab('overview')">📊 Обзор</button>
            <button class="tab" onclick="switchTab('users')">👥 Пользователи</button>
            <button class="tab" onclick="switchTab('partners')">🤝 Партнёры</button>
            <button class="tab" onclick="switchTab('content')">📦 Контент</button>
            <button class="tab" onclick="switchTab('tools')">🔧 Инструменты</button>
          </div>
          
          <!-- Overview Tab -->
          <div id="overview" class="tab-content active">
            <div class="section-header">
              <h2 class="section-title">📊 Общая статистика</h2>
            </div>
            
            <div class="stats">
              <button class="stat-card" onclick="switchTab('users')">
                <div class="stat-number">${stats.users}</div>
                <div class="stat-label">Пользователи</div>
              </button>
              <button class="stat-card" onclick="switchTab('partners')">
                <div class="stat-number">${stats.partners}</div>
                <div class="stat-label">Партнёры</div>
              </button>
              <button class="stat-card" onclick="switchTab('content')">
                <div class="stat-number">${stats.products}</div>
                <div class="stat-label">Товары</div>
              </button>
              <button class="stat-card" onclick="switchTab('content')">
                <div class="stat-number">${stats.categories}</div>
                <div class="stat-label">Категории</div>
              </button>
              <button class="stat-card" onclick="switchTab('content')">
                <div class="stat-number">${stats.reviews}</div>
                <div class="stat-label">Отзывы</div>
              </button>
              <button class="stat-card" onclick="switchTab('content')">
                <div class="stat-number">${stats.orders}</div>
                <div class="stat-label">Заказы</div>
              </button>
            </div>
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="margin: 0; color: #1976d2;">💰 Общий баланс всех партнёров: ${stats.totalBalance.toFixed(2)} PZ</h3>
            </div>
          </div>
          
          <!-- Users Tab -->
          <div id="users" class="tab-content">
            <div class="section-header">
              <h2 class="section-title">👥 Управление пользователями v2.0</h2>
              <div class="action-buttons">
                <a href="/admin/users" class="btn">📋 Список пользователей</a>
                <a href="/admin/user-history" class="btn">📊 История действий</a>
              </div>
            </div>
            <p>Управление пользователями бота, просмотр истории действий и статистики.</p>
          </div>
          
          <!-- Partners Tab -->
          <div id="partners" class="tab-content">
            <div class="section-header">
              <h2 class="section-title">🤝 Управление партнёрами v2.0</h2>
              <div class="action-buttons">
                <a href="/admin/partners" class="btn">📋 Список партнёров</a>
                <a href="/admin/partners-hierarchy" class="btn">🌳 Иерархия</a>
                <a href="/admin/debug-partners" class="btn">🔍 Отладка</a>
              </div>
            </div>
            <p>Управление партнёрской программой, бонусами и рефералами.</p>
          </div>
          
          <!-- Content Tab -->
          <div id="content" class="tab-content">
            <div class="section-header">
              <h2 class="section-title">📦 Управление контентом</h2>
              <div class="action-buttons">
                <a href="/admin/categories" class="btn">📁 Категории</a>
                <a href="/admin/products" class="btn">🛍️ Товары</a>
                <a href="/admin/reviews" class="btn">⭐ Отзывы</a>
                <a href="/admin/orders" class="btn">📦 Заказы</a>
              </div>
            </div>
            <p>Управление каталогом товаров, отзывами и заказами.</p>
          </div>
          
          <!-- Tools Tab -->
          <div id="tools" class="tab-content">
            <div class="section-header">
              <h2 class="section-title">🔧 Инструменты и утилиты</h2>
              <div class="action-buttons">
                <a href="/admin/test-referral-links" class="btn">🧪 Тест ссылок</a>
              </div>
            </div>
            <p>Дополнительные инструменты для отладки и тестирования.</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="/admin/logout" class="btn" style="background: #dc3545;">Выйти</a>
          </div>
        </div>
        
        <script>
          function switchTab(tabName) {
            // Hide all tab contents
            const contents = document.querySelectorAll('.tab-content');
            contents.forEach(content => content.classList.remove('active'));
            
            // Remove active class from all tabs
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => tab.classList.remove('active'));
            
            // Show selected tab content
            document.getElementById(tabName).classList.add('active');
            
            // Add active class to clicked tab
            event.target.classList.add('active');
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Admin panel error:', error);
    res.status(500).send('Internal server error');
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
      include: { 
        user: true,
        referrals: {
          include: {
            profile: {
              include: {
                user: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate total balance of all partners
    const totalBalance = partners.reduce((sum, partner) => sum + partner.balance, 0);

    // Find inviters for each partner
    const partnersWithInviters = await Promise.all(
      partners.map(async (partner) => {
        // Find who invited this partner
        const inviterReferral = await prisma.partnerReferral.findFirst({
          where: { referredId: partner.user.id },
          include: {
            profile: {
              include: {
                user: true
              }
            }
          }
        });

        return {
          ...partner,
          inviter: inviterReferral?.profile?.user || null
        };
      })
    );

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
        <h2>👥 Управление партнёрами v2.0</h2>
        <p style="color: #666; font-size: 12px; margin: 5px 0;">Версия: 2.0 | ${new Date().toLocaleString()}</p>
        <a href="/admin" class="btn">← Назад</a>
        <a href="/admin/partners-hierarchy" class="btn" style="background: #6f42c1;">🌳 Иерархия партнёров</a>
        <a href="/admin/test-referral-links" class="btn" style="background: #17a2b8;">🧪 Тест ссылок</a>
        <form method="post" action="/admin/recalculate-bonuses" style="display: inline;">
          <button type="submit" class="btn" style="background: #28a745;" onclick="return confirm('Пересчитать бонусы всех партнёров?')">🔄 Пересчитать бонусы</button>
        </form>
        <form method="post" action="/admin/cleanup-duplicates" style="display: inline;">
          <button type="submit" class="btn" style="background: #dc3545;" onclick="return confirm('⚠️ Удалить дублирующиеся записи партнёров и транзакций? Это действие необратимо!')">🧹 Очистить дубли</button>
        </form>
        <form method="post" action="/admin/recalculate-all-balances" style="display: inline;">
          <button type="submit" class="btn" style="background: #ffc107; color: #000;" onclick="return confirm('🔄 Пересчитать ВСЕ балансы партнёров?')">🔄 Пересчитать все балансы</button>
        </form>
        <a href="/admin/debug-partners" class="btn" style="background: #6c757d;">🔍 Отладка партнёров</a>
        <form method="post" action="/admin/cleanup-referral-duplicates" style="display: inline;">
          <button type="submit" class="btn" style="background: #dc3545;" onclick="return confirm('⚠️ Очистить дублирующиеся записи рефералов? Это действие необратимо!')">🧹 Очистить дубли рефералов</button>
        </form>
        <form method="post" action="/admin/force-recalculate-bonuses" style="display: inline;">
          <button type="submit" class="btn" style="background: #17a2b8;" onclick="return confirm('🔄 Принудительно пересчитать ВСЕ бонусы?')">🔄 Пересчитать бонусы</button>
        </form>
        <form method="post" action="/admin/cleanup-duplicate-bonuses" style="display: inline;">
          <button type="submit" class="btn" style="background: #dc3545;" onclick="return confirm('⚠️ Удалить дублирующиеся бонусы? Это действие необратимо!')">🧹 Очистить дубли бонусов</button>
        </form>
        <form method="post" action="/admin/fix-roman-bonuses" style="display: inline;">
          <button type="submit" class="btn" style="background: #28a745;" onclick="return confirm('🔧 Исправить бонусы Roman Arctur?')">🔧 Исправить бонусы Roman</button>
        </form>
        
        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0; color: #1976d2;">💰 Общий баланс всех партнёров: ${totalBalance.toFixed(2)} PZ</h3>
        </div>
        
        ${req.query.success === 'inviter_changed' ? '<div class="alert alert-success">✅ Пригласитель успешно изменен</div>' : ''}
        ${req.query.error === 'inviter_not_found' ? '<div class="alert alert-error">❌ Пригласитель с таким кодом не найден</div>' : ''}
        ${req.query.error === 'inviter_change' ? '<div class="alert alert-error">❌ Ошибка при смене пригласителя</div>' : ''}
        ${req.query.success === 'balance_added' ? '<div class="alert alert-success">✅ Баланс успешно пополнен</div>' : ''}
        ${req.query.success === 'balance_subtracted' ? '<div class="alert alert-success">✅ Баланс успешно списан</div>' : ''}
        ${req.query.success === 'bonuses_recalculated' ? '<div class="alert alert-success">✅ Бонусы успешно пересчитаны</div>' : ''}
        ${req.query.success === 'duplicates_cleaned' ? `<div class="alert alert-success">✅ Дубли очищены! Удалено ${req.query.referrals || 0} дублей рефералов и ${req.query.transactions || 0} дублей транзакций</div>` : ''}
        ${req.query.success === 'all_balances_recalculated' ? '<div class="alert alert-success">✅ Все балансы партнёров пересчитаны</div>' : ''}
        ${req.query.success === 'referral_duplicates_cleaned' ? `<div class="alert alert-success">✅ Дубли рефералов очищены! Удалено ${req.query.count || 0} дублей</div>` : ''}
        ${req.query.success === 'bonuses_force_recalculated' ? '<div class="alert alert-success">✅ Все бонусы принудительно пересчитаны</div>' : ''}
        ${req.query.success === 'duplicate_bonuses_cleaned' ? `<div class="alert alert-success">✅ Дубли бонусов очищены! Удалено ${req.query.count || 0} дублей</div>` : ''}
        ${req.query.success === 'roman_bonuses_fixed' ? `<div class="alert alert-success">✅ Бонусы Roman Arctur исправлены! Новый бонус: ${req.query.bonus || 0} PZ</div>` : ''}
        ${req.query.error === 'balance_add' ? '<div class="alert alert-error">❌ Ошибка при пополнении баланса</div>' : ''}
        ${req.query.error === 'balance_subtract' ? '<div class="alert alert-error">❌ Ошибка при списании баланса</div>' : ''}
        ${req.query.error === 'bonus_recalculation' ? '<div class="alert alert-error">❌ Ошибка при пересчёте бонусов</div>' : ''}
        ${req.query.error === 'balance_recalculation_failed' ? '<div class="alert alert-error">❌ Ошибка при пересчёте всех балансов</div>' : ''}
        ${req.query.error === 'bonus_force_recalculation_failed' ? '<div class="alert alert-error">❌ Ошибка при принудительном пересчёте бонусов</div>' : ''}
        ${req.query.error === 'duplicate_bonuses_cleanup_failed' ? '<div class="alert alert-error">❌ Ошибка при очистке дублей бонусов</div>' : ''}
        ${req.query.error === 'roman_bonuses_fix_failed' ? '<div class="alert alert-error">❌ Ошибка при исправлении бонусов Roman</div>' : ''}
        ${req.query.error === 'roman_profile_not_found' ? '<div class="alert alert-error">❌ Профиль Roman Arctur не найден</div>' : ''}
        ${req.query.error === 'referral_cleanup_failed' ? '<div class="alert alert-error">❌ Ошибка при очистке дублей рефералов</div>' : ''}
        ${req.query.error === 'cleanup_failed' ? '<div class="alert alert-error">❌ Ошибка при очистке дублей</div>' : ''}
        <style>
          .change-inviter-btn { background: #10b981; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 5px; }
          .change-inviter-btn:hover { background: #059669; }
          .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
          .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
        <table>
          <tr><th>Пользователь</th><th>Тип программы</th><th>Баланс</th><th>Бонусы</th><th>Партнёров</th><th>Код</th><th>Пригласитель</th><th>Создан</th><th>Действия</th></tr>
    `;

    partnersWithInviters.forEach(partner => {
      html += `
        <tr>
          <td>${partner.user.firstName || 'Не указан'}</td>
          <td>${partner.programType === 'DIRECT' ? 'Прямая (25%)' : 'Многоуровневая (15%+5%+5%)'}</td>
          <td>${partner.balance} PZ</td>
          <td>${partner.bonus} PZ</td>
          <td>${partner.totalPartners}</td>
          <td>${partner.referralCode}</td>
          <td>
            ${partner.inviter 
              ? `${partner.inviter.firstName || ''} ${partner.inviter.lastName || ''} ${partner.inviter.username ? `(@${partner.inviter.username})` : ''}`.trim()
              : 'Нет данных'
            }
          </td>
          <td>${new Date(partner.createdAt).toLocaleDateString()}</td>
          <td>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
              <form method="post" action="/admin/partners/${partner.id}/change-inviter" style="display: inline;">
                <input type="text" name="newInviterCode" placeholder="Код пригласителя" style="width: 120px; padding: 4px; font-size: 11px;" required>
                <button type="submit" class="change-inviter-btn" onclick="return confirm('Изменить пригласителя для ${partner.user.firstName || 'пользователя'}?')" style="padding: 4px 8px; font-size: 11px;">🔄</button>
              </form>
              <form method="post" action="/admin/partners/${partner.id}/add-balance" style="display: inline;">
                <input type="number" name="amount" placeholder="Сумма" style="width: 80px; padding: 4px; font-size: 11px;" step="0.01" required>
                <button type="submit" class="balance-btn" style="background: #28a745; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 2px;">💰+</button>
              </form>
              <form method="post" action="/admin/partners/${partner.id}/subtract-balance" style="display: inline;">
                <input type="number" name="amount" placeholder="Сумма" style="width: 80px; padding: 4px; font-size: 11px;" step="0.01" required>
                <button type="submit" class="balance-btn" style="background: #dc3545; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 2px;">💰-</button>
              </form>
            </div>
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

// Partners hierarchy route
router.get('/partners-hierarchy', requireAdmin, async (req, res) => {
  try {
    // Get all partners with their referrals
    const partners = await prisma.partnerProfile.findMany({
      include: {
        user: true,
        referrals: {
          include: {
            profile: {
              include: {
                user: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Find inviters for each partner
    const partnersWithInviters = await Promise.all(
      partners.map(async (partner) => {
        const inviterReferral = await prisma.partnerReferral.findFirst({
          where: { referredId: partner.user.id },
          include: {
            profile: {
              include: {
                user: true
              }
            }
          }
        });

        return {
          ...partner,
          inviter: inviterReferral?.profile?.user || null
        };
      })
    );

    // Build hierarchy tree
    function buildHierarchyTree() {
      const rootPartners = partnersWithInviters.filter(p => !p.inviter);
      const hierarchyHtml: string[] = [];

      function buildPartnerNode(partner: any, level = 0) {
        const indent = '  '.repeat(level);
        const levelEmoji = level === 0 ? '👑' : level === 1 ? '🥈' : level === 2 ? '🥉' : '📋';
        const partnerName = `${partner.user.firstName || ''} ${partner.user.lastName || ''}`.trim();
        const username = partner.user.username ? ` (@${partner.user.username})` : '';
        const balance = partner.balance.toFixed(2);
        // Count unique referrals (avoid duplicates)
        const uniqueReferrals = new Set(partner.referrals.map((r: any) => r.referredId).filter(Boolean));
        const referrals = uniqueReferrals.size;
        
        let node = `${indent}${levelEmoji} ${partnerName}${username} - ${balance} PZ (${referrals} рефералов)\n`;
        
        // Add referrals
        const directReferrals = partnersWithInviters.filter(p => 
          p.inviter && p.inviter.id === partner.user.id
        );
        
        directReferrals.forEach(referral => {
          node += buildPartnerNode(referral, level + 1);
        });
        
        return node;
      }

      rootPartners.forEach(rootPartner => {
        hierarchyHtml.push(buildPartnerNode(rootPartner));
      });

      return hierarchyHtml.join('\n');
    }

    const hierarchyTree = buildHierarchyTree();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Иерархия партнёров</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px; }
          h2 { color: #333; margin-bottom: 20px; }
          .btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 5px; }
          .btn:hover { background: #0056b3; }
          .hierarchy-tree { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; white-space: pre-line; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.6; border: 1px solid #e9ecef; }
          .stats { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-around; text-align: center; }
          .stat-item h4 { margin: 0; color: #1976d2; }
          .stat-item p { margin: 5px 0 0 0; font-size: 18px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🌳 Иерархия партнёров v2.0</h2>
          <p style="color: #666; font-size: 12px; margin: 5px 0;">Версия: 2.0 | ${new Date().toLocaleString()}</p>
          <a href="/admin/partners" class="btn">← К партнёрам</a>
          <a href="/admin" class="btn">🏠 Главная</a>
          
          <div class="stats">
            <div class="stat-item">
              <h4>Всего партнёров</h4>
              <p>${partnersWithInviters.length}</p>
            </div>
            <div class="stat-item">
              <h4>Корневых партнёров</h4>
              <p>${partnersWithInviters.filter(p => !p.inviter).length}</p>
            </div>
            <div class="stat-item">
              <h4>Общий баланс</h4>
              <p>${partnersWithInviters.reduce((sum, p) => sum + p.balance, 0).toFixed(2)} PZ</p>
            </div>
          </div>
          
          <div class="hierarchy-tree">
            <h3>🌳 Дерево партнёрской иерархии:</h3>
            ${hierarchyTree || 'Партнёрская иерархия пуста'}
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <h4 style="margin: 0 0 10px 0; color: #856404;">📋 Обозначения:</h4>
            <p style="margin: 0; color: #856404;">
              👑 Корневые партнёры (без пригласителя)<br>
              🥈 Партнёры 1-го уровня<br>
              🥉 Партнёры 2-го уровня<br>
              📋 Партнёры 3-го уровня и ниже
            </p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Partners hierarchy error:', error);
    res.status(500).send('Ошибка загрузки иерархии партнёров');
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
            <div style="margin: 8px 0;">
              <span style="font-size: 12px; color: #666;">Регионы:</span>
              ${(product as any).availableInRussia ? '<span style="background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 4px;">🇷🇺 Россия</span>' : ''}
              ${(product as any).availableInBali ? '<span style="background: #f3e5f5; color: #7b1fa2; padding: 2px 6px; border-radius: 4px; font-size: 11px;">🇮🇩 Бали</span>' : ''}
            </div>
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
      include: { 
        user: {
          include: {
            partner: true
          }
        }
      },
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
        <h2>📦 Управление заказами v2.0</h2>
        <p style="color: #666; font-size: 12px; margin: 5px 0;">Версия: 2.0 | ${new Date().toLocaleString()}</p>
        <a href="/admin" class="btn">← Назад</a>
        
        ${req.query.success === 'order_updated' ? '<div class="alert alert-success">✅ Статус заказа обновлен</div>' : ''}
        ${req.query.error === 'order_update' ? '<div class="alert alert-error">❌ Ошибка при обновлении статуса заказа</div>' : ''}
        ${req.query.success === 'balance_added' ? '<div class="alert alert-success">✅ Баланс пользователя пополнен</div>' : ''}
        ${req.query.success === 'order_paid' ? '<div class="alert alert-success">✅ Заказ оплачен, партнёрские вознаграждения начислены</div>' : ''}
        ${req.query.error === 'insufficient_balance' ? '<div class="alert alert-error">❌ Недостаточно средств на балансе пользователя</div>' : ''}
        ${req.query.error === 'invalid_amount' ? '<div class="alert alert-error">❌ Неверная сумма для пополнения</div>' : ''}
        ${req.query.error === 'payment_failed' ? '<div class="alert alert-error">❌ Ошибка при оплате заказа</div>' : ''}
        ${req.query.error === 'order_not_found' ? '<div class="alert alert-error">❌ Заказ не найден</div>' : ''}
        <style>
          .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
          .status-new { background: #fff3cd; color: #856404; }
          .status-processing { background: #d1ecf1; color: #0c5460; }
          .status-completed { background: #d4edda; color: #155724; }
          .status-cancelled { background: #f8d7da; color: #721c24; }
          .alert { padding: 10px; margin: 10px 0; border-radius: 4px; }
          .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
        <table>
          <tr><th>ID</th><th>Пользователь</th><th>Баланс</th><th>Статус</th><th>Контакт</th><th>Сообщение</th><th>Создан</th><th>Действия</th></tr>
    `;

    orders.forEach(order => {
      html += `
        <tr>
          <td>${order.id.substring(0, 8)}...</td>
          <td>${order.user?.firstName || 'Не указан'}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="font-weight: bold; color: ${(order.user as any)?.balance > 0 ? '#28a745' : '#dc3545'};">${((order.user as any)?.balance || 0).toFixed(2)} PZ</span>
              <form method="post" action="/admin/users/${order.user?.id}/add-balance" style="display: inline;">
                <input type="number" name="amount" placeholder="Сумма" style="width: 60px; padding: 2px; font-size: 10px;" step="0.01" min="0.01" required>
                <button type="submit" style="background: #28a745; color: white; padding: 2px 6px; border: none; border-radius: 3px; cursor: pointer; font-size: 10px;">+</button>
              </form>
            </div>
          </td>
          <td>
            <span class="status-badge status-${order.status.toLowerCase()}">${order.status}</span>
          </td>
          <td>${order.contact || 'Не указан'}</td>
          <td>${order.message.substring(0, 50)}${order.message.length > 50 ? '...' : ''}</td>
          <td>${new Date(order.createdAt).toLocaleDateString()}</td>
          <td>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
              <form method="post" action="/admin/orders/${order.id}/update-status" style="display: inline;">
                <select name="status" style="padding: 4px; font-size: 11px;">
                  <option value="NEW" ${order.status === 'NEW' ? 'selected' : ''}>Новый</option>
                  <option value="PROCESSING" ${order.status === 'PROCESSING' ? 'selected' : ''}>В обработке</option>
                  <option value="COMPLETED" ${order.status === 'COMPLETED' ? 'selected' : ''}>Выполнен</option>
                  <option value="CANCELLED" ${order.status === 'CANCELLED' ? 'selected' : ''}>Отменен</option>
                </select>
                <button type="submit" style="background: #007bff; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 2px;">Обновить</button>
              </form>
              <form method="post" action="/admin/orders/${order.id}/pay" style="display: inline;">
                <button type="submit" 
                        style="background: ${(order.user as any)?.balance > 0 ? '#28a745' : '#6c757d'}; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; ${(order.user as any)?.balance <= 0 ? 'opacity: 0.5;' : ''}" 
                        ${(order.user as any)?.balance <= 0 ? 'disabled' : ''}
                        onclick="return confirm('Списать ${((order.user as any)?.balance || 0).toFixed(2)} PZ с баланса пользователя?')">
                  💳 Заказ оплачен
                </button>
              </form>
            </div>
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

// Recalculate bonuses endpoint
router.post('/recalculate-bonuses', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Starting bonus recalculation...');
    
    // Get all partner profiles
    const profiles = await prisma.partnerProfile.findMany();
    
    for (const profile of profiles) {
      console.log(`📊 Processing profile ${profile.id}...`);
      
      // Calculate total bonus from transactions
      const transactions = await prisma.partnerTransaction.findMany({
        where: { profileId: profile.id }
      });
      
      const totalBonus = transactions.reduce((sum, tx) => {
        return sum + (tx.type === 'CREDIT' ? tx.amount : -tx.amount);
      }, 0);
      
      // Update profile bonus
      await prisma.partnerProfile.update({
        where: { id: profile.id },
        data: { bonus: totalBonus }
      });
      
      console.log(`✅ Updated profile ${profile.id}: ${totalBonus} PZ bonus`);
    }
    
    console.log('🎉 Bonus recalculation completed!');
    res.redirect('/admin/partners?success=bonuses_recalculated');
  } catch (error) {
    console.error('❌ Bonus recalculation error:', error);
    res.redirect('/admin/partners?error=bonus_recalculation');
  }
});

// Cleanup duplicates endpoint
router.post('/cleanup-duplicates', requireAdmin, async (req, res) => {
  try {
    console.log('🧹 Starting cleanup of duplicate data...');
    
    // Find all partner profiles
    const profiles = await prisma.partnerProfile.findMany({
      include: {
        referrals: true,
        transactions: true
      }
    });
    
    let totalReferralsDeleted = 0;
    let totalTransactionsDeleted = 0;
    
    for (const profile of profiles) {
      console.log(`\n📊 Processing profile ${profile.id}...`);
      
      // Group referrals by referredId to find duplicates
      const referralGroups = new Map();
      profile.referrals.forEach(ref => {
        if (ref.referredId) {
          if (!referralGroups.has(ref.referredId)) {
            referralGroups.set(ref.referredId, []);
          }
          referralGroups.get(ref.referredId).push(ref);
        }
      });
      
      // Remove duplicate referrals, keeping only the first one
      for (const [referredId, referrals] of referralGroups) {
        if (referrals.length > 1) {
          console.log(`  🔄 Found ${referrals.length} duplicates for user ${referredId}`);
          
          // Sort by createdAt to keep the earliest
          referrals.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
          
          // Keep the first one, delete the rest
          const toDelete = referrals.slice(1);
          for (const duplicate of toDelete) {
            await prisma.partnerReferral.delete({
              where: { id: duplicate.id }
            });
            totalReferralsDeleted++;
            console.log(`    ❌ Deleted duplicate referral ${duplicate.id}`);
          }
        }
      }
      
      // Group transactions by description to find duplicates
      const transactionGroups = new Map();
      profile.transactions.forEach(tx => {
        const key = `${tx.description}-${tx.amount}-${tx.type}`;
        if (!transactionGroups.has(key)) {
          transactionGroups.set(key, []);
        }
        transactionGroups.get(key).push(tx);
      });
      
      // Remove duplicate transactions, keeping only the first one
      for (const [key, transactions] of transactionGroups) {
        if (transactions.length > 1) {
          console.log(`  🔄 Found ${transactions.length} duplicate transactions: ${key}`);
          
          // Sort by createdAt to keep the earliest
          transactions.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
          
          // Keep the first one, delete the rest
          const toDelete = transactions.slice(1);
          for (const duplicate of toDelete) {
            await prisma.partnerTransaction.delete({
              where: { id: duplicate.id }
            });
            totalTransactionsDeleted++;
            console.log(`    ❌ Deleted duplicate transaction ${duplicate.id}`);
          }
        }
      }
      
      // Recalculate bonus from remaining transactions
      const remainingTransactions = await prisma.partnerTransaction.findMany({
        where: { profileId: profile.id }
      });
      
      const totalBonus = remainingTransactions.reduce((sum, tx) => {
        return sum + (tx.type === 'CREDIT' ? tx.amount : -tx.amount);
      }, 0);
      
      // Update profile bonus
      await prisma.partnerProfile.update({
        where: { id: profile.id },
        data: { bonus: totalBonus }
      });
      
      console.log(`  ✅ Updated profile ${profile.id}: ${totalBonus} PZ bonus`);
    }
    
    console.log(`\n🎉 Cleanup completed! Deleted ${totalReferralsDeleted} duplicate referrals and ${totalTransactionsDeleted} duplicate transactions.`);
    res.redirect(`/admin/partners?success=duplicates_cleaned&referrals=${totalReferralsDeleted}&transactions=${totalTransactionsDeleted}`);
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.redirect('/admin/partners?error=cleanup_failed');
  }
});

// Test referral links endpoint
router.get('/test-referral-links', requireAdmin, async (req, res) => {
  try {
    const { buildReferralLink } = await import('../services/partner-service.js');
    
    // Get a sample partner profile
    const profile = await prisma.partnerProfile.findFirst({
      include: { user: true }
    });
    
    if (!profile) {
      return res.send('❌ No partner profiles found for testing');
    }
    
    const directLink = buildReferralLink(profile.referralCode, 'DIRECT');
    const multiLink = buildReferralLink(profile.referralCode, 'MULTI_LEVEL');
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Referral Links</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; }
          .test-section { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; }
          .link { background: #e3f2fd; padding: 10px; margin: 5px 0; border-radius: 4px; word-break: break-all; }
          .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
        </style>
      </head>
      <body>
        <h2>🧪 Test Referral Links</h2>
        <a href="/admin/partners" class="btn">← Back to Partners</a>
        
        <div class="test-section">
          <h3>📊 Test Partner Profile</h3>
          <p><strong>Name:</strong> ${profile.user.firstName || 'Unknown'}</p>
          <p><strong>Username:</strong> @${profile.user.username || 'no-username'}</p>
          <p><strong>Program Type:</strong> ${profile.programType}</p>
          <p><strong>Referral Code:</strong> ${profile.referralCode}</p>
        </div>
        
        <div class="test-section">
          <h3>🔗 Generated Links</h3>
          
          <h4>Direct Link (25% commission):</h4>
          <div class="link">${directLink}</div>
          <p><strong>Payload:</strong> ${directLink.split('?start=')[1]}</p>
          
          <h4>Multi-level Link (15% + 5% + 5% commission):</h4>
          <div class="link">${multiLink}</div>
          <p><strong>Payload:</strong> ${multiLink.split('?start=')[1]}</p>
        </div>
        
        <div class="test-section">
          <h3>🧪 Link Parsing Test</h3>
          <p>Both links should be parsed correctly by the bot:</p>
          <ul>
            <li><strong>Direct link payload:</strong> Should start with "ref_direct_"</li>
            <li><strong>Multi link payload:</strong> Should start with "ref_multi_"</li>
            <li><strong>Both should:</strong> Award 3 PZ bonus to the inviter</li>
            <li><strong>Both should:</strong> Create a referral record with level 1</li>
          </ul>
        </div>
        
        <div class="test-section">
          <h3>📱 Test Instructions</h3>
          <ol>
            <li>Copy one of the links above</li>
            <li>Open it in Telegram</li>
            <li>Start the bot</li>
            <li>Check that you receive a welcome message</li>
            <li>Check that the inviter gets 3 PZ bonus</li>
            <li>Check that a referral record is created</li>
          </ol>
        </div>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Test referral links error:', error);
    res.send('❌ Error testing referral links: ' + (error instanceof Error ? error.message : String(error)));
  }
});

// Force recalculate all partner balances
router.post('/recalculate-all-balances', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Starting full balance recalculation...');
    
    // Get all partner profiles
    const profiles = await prisma.partnerProfile.findMany();
    
    for (const profile of profiles) {
      console.log(`📊 Processing profile ${profile.id}...`);
      
      // Use the centralized bonus recalculation function
      const totalBonus = await recalculatePartnerBonuses(profile.id);
      
      console.log(`✅ Updated profile ${profile.id}: ${totalBonus} PZ bonus`);
    }
    
    console.log('🎉 Full balance recalculation completed!');
    res.redirect('/admin/partners?success=all_balances_recalculated');
  } catch (error) {
    console.error('❌ Full balance recalculation error:', error);
    res.redirect('/admin/partners?error=balance_recalculation_failed');
  }
});

// Debug partners page
router.get('/debug-partners', requireAdmin, async (req, res) => {
  try {
    const partners = await prisma.partnerProfile.findMany({
      include: {
        user: true,
        referrals: true,
        transactions: true
      },
      orderBy: { createdAt: 'desc' }
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>🔍 Отладка партнёров</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .partner-card { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 8px; background: #f9f9f9; }
          .partner-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
          .partner-name { font-weight: bold; font-size: 16px; }
          .partner-id { color: #666; font-size: 12px; }
          .stats { display: flex; gap: 20px; margin: 10px 0; }
          .stat { background: #e3f2fd; padding: 8px 12px; border-radius: 4px; }
          .referrals { margin-top: 10px; }
          .referral { background: #f0f0f0; padding: 8px; margin: 5px 0; border-radius: 4px; font-size: 14px; }
          .transactions { margin-top: 10px; }
          .transaction { background: #fff3cd; padding: 6px; margin: 3px 0; border-radius: 4px; font-size: 13px; }
          .btn { background: #007bff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 5px; }
          .btn:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔍 Отладка партнёров</h1>
          <a href="/admin/partners" class="btn">← Назад к партнёрам</a>
          <p>Всего партнёров: ${partners.length}</p>
    `;

    for (const partner of partners) {
      const totalBalance = Number(partner.balance) + Number(partner.bonus);
      const referralsCount = partner.referrals.length;
      const directReferrals = partner.referrals.filter(r => r.level === 1).length;
      const multiReferrals = partner.referrals.filter(r => r.level === 2).length;
      
      html += `
        <div class="partner-card">
          <div class="partner-header">
            <div>
              <div class="partner-name">${partner.user.firstName} ${partner.user.lastName || ''}</div>
              <div class="partner-id">ID: ${partner.id} | User: ${partner.userId}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: bold; color: #28a745;">${totalBalance.toFixed(2)} PZ</div>
              <div style="font-size: 12px; color: #666;">Баланс + Бонусы</div>
            </div>
          </div>
          
          <div class="stats">
            <div class="stat">💰 Баланс: ${Number(partner.balance).toFixed(2)} PZ</div>
            <div class="stat">🎁 Бонусы: ${Number(partner.bonus).toFixed(2)} PZ</div>
            <div class="stat">👥 Всего рефералов: ${referralsCount}</div>
            <div class="stat">📊 Прямых: ${directReferrals}</div>
            <div class="stat">🌐 Мульти: ${multiReferrals}</div>
          </div>
          
          ${referralsCount > 0 ? `
            <div class="referrals">
              <h4>👥 Рефералы:</h4>
              ${partner.referrals.map((ref: any) => `
                <div class="referral">
                  Реферал ID: ${ref.referredId || 'N/A'} 
                  (Уровень ${ref.level}, Контакт: ${ref.contact || 'N/A'})
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${partner.transactions.length > 0 ? `
            <div class="transactions">
              <h4>💰 Последние транзакции:</h4>
              ${partner.transactions.slice(0, 5).map((tx: any) => `
                <div class="transaction">
                  ${tx.type === 'CREDIT' ? '+' : '-'}${Number(tx.amount).toFixed(2)} PZ — ${tx.description}
                  <span style="color: #666; font-size: 11px;">(${new Date(tx.createdAt).toLocaleString()})</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    html += `
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Debug partners error:', error);
    res.send('❌ Ошибка отладки партнёров: ' + (error instanceof Error ? error.message : String(error)));
  }
});

// Cleanup referral duplicates
router.post('/cleanup-referral-duplicates', requireAdmin, async (req, res) => {
  try {
    console.log('🧹 Starting referral duplicates cleanup...');
    
    // Find all referrals
    const allReferrals = await prisma.partnerReferral.findMany({
      where: { referredId: { not: null } },
      orderBy: { createdAt: 'asc' }
    });
    
    // Group by profileId + referredId combination
    const grouped = new Map<string, any[]>();
    for (const ref of allReferrals) {
      const key = `${ref.profileId}-${ref.referredId}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(ref);
    }
    
    let deletedCount = 0;
    
    // Process duplicates
    for (const [key, referrals] of grouped) {
      if (referrals.length > 1) {
        // Keep the first one, delete the rest
        const toDelete = referrals.slice(1);
        for (const ref of toDelete) {
          await prisma.partnerReferral.delete({
            where: { id: ref.id }
          });
          deletedCount++;
        }
      }
    }
    
    console.log(`✅ Cleaned up ${deletedCount} duplicate referrals`);
    
    // Recalculate all bonuses after cleanup
    console.log('🔄 Recalculating all bonuses after referral cleanup...');
    const profiles = await prisma.partnerProfile.findMany();
    for (const profile of profiles) {
      await recalculatePartnerBonuses(profile.id);
    }
    
    res.redirect('/admin/partners?success=referral_duplicates_cleaned&count=' + deletedCount);
  } catch (error) {
    console.error('❌ Referral duplicates cleanup error:', error);
    res.redirect('/admin/partners?error=referral_cleanup_failed');
  }
});

// Force recalculate all bonuses
router.post('/force-recalculate-bonuses', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Starting forced bonus recalculation...');
    
    // Get all partner profiles
    const profiles = await prisma.partnerProfile.findMany();
    
    for (const profile of profiles) {
      console.log(`📊 Recalculating bonuses for profile ${profile.id}...`);
      
      // Use the centralized bonus recalculation function
      const totalBonus = await recalculatePartnerBonuses(profile.id);
      
      console.log(`✅ Updated profile ${profile.id}: ${totalBonus} PZ bonus`);
    }
    
    console.log('🎉 Forced bonus recalculation completed!');
    res.redirect('/admin/partners?success=bonuses_force_recalculated');
  } catch (error) {
    console.error('❌ Forced bonus recalculation error:', error);
    res.redirect('/admin/partners?error=bonus_force_recalculation_failed');
  }
});

// Force recalculate specific partner bonuses
router.post('/recalculate-partner-bonuses/:profileId', requireAdmin, async (req, res) => {
  try {
    const { profileId } = req.params;
    console.log(`🔄 Force recalculating bonuses for profile ${profileId}...`);
    
    const totalBonus = await recalculatePartnerBonuses(profileId);
    
    console.log(`✅ Force recalculated bonuses for profile ${profileId}: ${totalBonus} PZ`);
    res.redirect(`/admin/partners?success=partner_bonuses_recalculated&bonus=${totalBonus}`);
  } catch (error) {
    console.error('❌ Force recalculate partner bonuses error:', error);
    res.redirect('/admin/partners?error=partner_bonus_recalculation_failed');
  }
});

// Cleanup duplicate bonuses
router.post('/cleanup-duplicate-bonuses', requireAdmin, async (req, res) => {
  try {
    console.log('🧹 Starting duplicate bonuses cleanup...');
    
    // Get all partner profiles
    const profiles = await prisma.partnerProfile.findMany();
    let totalDeleted = 0;
    
    for (const profile of profiles) {
      console.log(`📊 Processing profile ${profile.id}...`);
      
      // Get all transactions for this profile
      const transactions = await prisma.partnerTransaction.findMany({
        where: { 
          profileId: profile.id,
          description: { contains: 'Бонус за приглашение друга' }
        },
        orderBy: { createdAt: 'asc' }
      });
      
      // Group by user ID (extract from description) or by amount+description for old format
      const bonusGroups = new Map<string, any[]>();
      
      for (const tx of transactions) {
        // Extract user ID from description like "Бонус за приглашение друга (user_id)"
        const match = tx.description.match(/Бонус за приглашение друга \((.+?)\)/);
        if (match) {
          const userId = match[1];
          if (!bonusGroups.has(userId)) {
            bonusGroups.set(userId, []);
          }
          bonusGroups.get(userId)!.push(tx);
        } else if (tx.description === 'Бонус за приглашение друга') {
          // Old format without user ID - group by amount and description
          const key = `${tx.amount}-${tx.description}`;
          if (!bonusGroups.has(key)) {
            bonusGroups.set(key, []);
          }
          bonusGroups.get(key)!.push(tx);
        }
      }
      
      // Delete duplicates (keep only the first one)
      for (const [key, group] of bonusGroups) {
        if (group.length > 1) {
          console.log(`  - Found ${group.length} duplicate bonuses for ${key}, keeping first one`);
          const toDelete = group.slice(1);
          for (const tx of toDelete) {
            await prisma.partnerTransaction.delete({
              where: { id: tx.id }
            });
            totalDeleted++;
          }
        }
      }
    }
    
    console.log(`✅ Cleaned up ${totalDeleted} duplicate bonus transactions`);
    
    // Recalculate all bonuses after cleanup
    console.log('🔄 Recalculating all bonuses after cleanup...');
    for (const profile of profiles) {
      await recalculatePartnerBonuses(profile.id);
    }
    
    res.redirect(`/admin/partners?success=duplicate_bonuses_cleaned&count=${totalDeleted}`);
  } catch (error) {
    console.error('❌ Duplicate bonuses cleanup error:', error);
    res.redirect('/admin/partners?error=duplicate_bonuses_cleanup_failed');
  }
});

// Fix Roman Arctur bonuses specifically
router.post('/fix-roman-bonuses', requireAdmin, async (req, res) => {
  try {
    console.log('🔧 Fixing Roman Arctur bonuses...');
    
    // Find Roman Arctur's profile
    const romanProfile = await prisma.partnerProfile.findFirst({
      where: {
        user: {
          username: 'roman_arctur'
        }
      }
    });
    
    if (!romanProfile) {
      console.log('❌ Roman Arctur profile not found');
      res.redirect('/admin/partners?error=roman_profile_not_found');
      return;
    }
    
    console.log(`📊 Found Roman Arctur profile: ${romanProfile.id}`);
    
    // Get all transactions for Roman
    const transactions = await prisma.partnerTransaction.findMany({
      where: { profileId: romanProfile.id }
    });
    
    console.log(`📊 Roman has ${transactions.length} transactions:`);
    transactions.forEach(tx => {
      console.log(`  - ${tx.type} ${tx.amount} PZ: ${tx.description} (${tx.createdAt})`);
    });
    
    // Check current bonus before recalculation
    const currentProfile = await prisma.partnerProfile.findUnique({
      where: { id: romanProfile.id }
    });
    console.log(`💰 Current bonus before recalculation: ${currentProfile?.bonus} PZ`);
    
    // Recalculate bonuses
    const totalBonus = await recalculatePartnerBonuses(romanProfile.id);
    
    // Check bonus after recalculation
    const updatedProfile = await prisma.partnerProfile.findUnique({
      where: { id: romanProfile.id }
    });
    console.log(`💰 Bonus after recalculation: ${updatedProfile?.bonus} PZ`);
    
    console.log(`✅ Roman Arctur bonuses fixed: ${totalBonus} PZ`);
    res.redirect(`/admin/partners?success=roman_bonuses_fixed&bonus=${totalBonus}`);
  } catch (error) {
    console.error('❌ Fix Roman bonuses error:', error);
    res.redirect('/admin/partners?error=roman_bonuses_fix_failed');
  }
});

export { router as adminWebRouter };

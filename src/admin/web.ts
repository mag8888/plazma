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

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

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
    // Calculate total balance of all partners (balance = total bonuses)
    const partners = await prisma.partnerProfile.findMany({
      include: {
        user: { select: { firstName: true, lastName: true } },
        transactions: true
      }
    });
    const totalBalance = partners.reduce((sum, partner) => sum + partner.balance, 0);
    
    // Debug: Log partner balances
    console.log('🔍 Debug: Partner balances:');
    partners.forEach(partner => {
      console.log(`  - ${partner.user.firstName || 'User'}: balance=${partner.balance}, transactions=${partner.transactions.length}`);
      partner.transactions.forEach(tx => {
        console.log(`    * ${tx.type} ${tx.amount} PZ - ${tx.description}`);
      });
    });
    console.log(`🔍 Debug: Total calculated balance: ${totalBalance} PZ`);

    const stats = {
      categories: await prisma.category.count(),
      products: await prisma.product.count(),
      partners: await prisma.partnerProfile.count(),
      reviews: await prisma.review.count(),
      orders: await prisma.orderRequest.count(),
      users: await prisma.user.count(),
      totalBalance: totalBalance,
    };

    // Helper function for detailed users section
    async function getDetailedUsersSection() {
      try {
        // Get all users with their related data
        const users = await prisma.user.findMany({
          include: {
            partner: {
              include: {
                referrals: true,
                transactions: true
              }
            },
            orders: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10 // Limit to 10 users for main page
        });

        // Calculate additional data for each user
        const usersWithStats = users.map((user: any) => {
          const partnerProfile = user.partner;
          const directPartners = partnerProfile?.referrals?.length || 0;
          
          // Calculate total referrals at all levels (simplified for main page)
          function countAllReferrals(userId: string, visited = new Set()): number {
            if (visited.has(userId)) return 0; // Prevent infinite loops
            visited.add(userId);
            
            const directReferrals = users.filter(u => 
              u.partner?.referrals?.some((ref: any) => ref.referredId === userId)
            );
            
            let totalCount = directReferrals.length;
            
            // Recursively count referrals of referrals
            directReferrals.forEach(ref => {
              totalCount += countAllReferrals(ref.id, new Set(visited));
            });
            
            return totalCount;
          }
          
          const totalPartners = countAllReferrals(user.id);
          
          const totalOrderSum = user.orders?.reduce((sum: number, order: any) => {
            try {
              const items = JSON.parse(order.itemsJson || '[]');
              const orderTotal = items.reduce((itemSum: number, item: any) => itemSum + (item.price || 0) * (item.quantity || 1), 0);
              return sum + orderTotal;
            } catch {
              return sum;
            }
          }, 0) || 0;
          const balance = partnerProfile?.balance || 0;
          const bonus = partnerProfile?.bonus || 0;
          const lastActivity = user.updatedAt || user.createdAt;
          
          return {
            ...user,
            directPartners,
            totalPartners,
            totalOrderSum,
            balance,
            bonus,
            lastActivity
          };
        });

        if (usersWithStats.length === 0) {
          return '<div class="empty-state"><h3>📭 Нет пользователей</h3><p>Пользователи появятся здесь после регистрации</p></div>';
        }

        return `
          <div class="detailed-users-container">
            <div class="table-controls" style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
              <div class="sort-controls">
                <label>Сортировать по:</label>
                <select id="sortBy" onchange="applySorting()">
                  <option value="name">Имени</option>
                  <option value="balance">Балансу</option>
                  <option value="partners">Партнёрам</option>
                  <option value="orders">Заказам</option>
                  <option value="activity">Активности</option>
                </select>
                <select id="sortOrder" onchange="applySorting()">
                  <option value="asc">По возрастанию</option>
                  <option value="desc">По убыванию</option>
                </select>
              </div>
              <div class="message-controls">
                <button class="btn" onclick="selectAllUsers()">Выбрать всех</button>
                <button class="btn" onclick="deselectAllUsers()">Снять выбор</button>
                <button class="btn" onclick="openMessageComposer()" style="background: #28a745;">📨 Отправить сообщение</button>
              </div>
            </div>
            <div class="users-table-container">
              <table class="users-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" id="selectAll" onchange="toggleAllUsers()"></th>
                    <th onclick="sortTable('name')" style="cursor: pointer;">Пользователь ↕️</th>
                    <th onclick="sortTable('balance')" style="cursor: pointer;">Баланс ↕️</th>
                    <th onclick="sortTable('partners')" style="cursor: pointer;">Партнёры ↕️</th>
                    <th onclick="sortTable('orders')" style="cursor: pointer;">Заказы ↕️</th>
                    <th onclick="sortTable('activity')" style="cursor: pointer;">Последняя активность ↕️</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  ${usersWithStats.map(user => `
                    <tr data-user-id="${user.id}" data-name="${user.firstName || 'Без имени'}" data-balance="${user.balance}" data-partners="${user.totalPartners}" data-orders="${user.totalOrderSum}" data-activity="${user.lastActivity.getTime()}">
                      <td><input type="checkbox" class="user-checkbox" value="${user.id}"></td>
                      <td>
                        <div class="user-info">
                          <div class="user-avatar">${(user.firstName || 'U')[0].toUpperCase()}</div>
                          <div class="user-details">
                            <h4>${user.firstName || 'Без имени'} ${user.lastName || ''}</h4>
                            <p>@${user.username || 'без username'}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div class="balance ${user.balance > 0 ? 'positive' : 'zero'}">
                          ${user.balance.toFixed(2)} PZ
                        </div>
                        ${user.bonus > 0 ? `<div style="font-size: 11px; color: #6c757d;">Бонусы: ${user.bonus.toFixed(2)} PZ</div>` : ''}
                      </td>
                      <td>
                        <div class="partners-count">${user.totalPartners} всего</div>
                        ${user.directPartners > 0 ? `<div style="font-size: 11px; color: #6c757d;">${user.directPartners} прямых</div>` : ''}
                      </td>
                      <td>
                        <div class="orders-sum">${user.totalOrderSum.toFixed(2)} PZ</div>
                        <div style="font-size: 11px; color: #6c757d;">${user.orders?.length || 0} заказов</div>
                      </td>
                      <td>
                        <div style="font-size: 13px; color: #6c757d;">
                          ${user.lastActivity.toLocaleString('ru-RU')}
                        </div>
                      </td>
                      <td>
                        ${user.partner ? `
                          <button class="action-btn hierarchy" onclick="showHierarchy('${user.id}')">
                            🌳 Иерархия
                          </button>
                        ` : ''}
                        <button class="action-btn" onclick="showUserDetails('${user.id}')">
                          👁 Подробно
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="/admin/users-detailed" class="btn">📊 Полный список пользователей</a>
            </div>
          </div>
        `;
      } catch (error) {
        return '<div class="empty-state"><h3>❌ Ошибка загрузки</h3><p>Не удалось загрузить данные пользователей</p></div>';
      }
    }

    // Helper functions for lists
    async function getRecentUsers() {
      try {
        const users = await prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { firstName: true, lastName: true, username: true, createdAt: true }
        });
        
        if (users.length === 0) {
          return '<div class="empty-list">Нет пользователей</div>';
        }
        
        return users.map(user => `
          <div class="list-item">
            <div class="list-info">
              <div class="list-name">${user.firstName || 'Пользователь'} ${user.lastName || ''}</div>
              <div class="list-time">${user.createdAt.toLocaleString('ru-RU')}</div>
            </div>
            <div>@${user.username || 'без username'}</div>
          </div>
        `).join('');
      } catch (error) {
        return '<div class="empty-list">Ошибка загрузки</div>';
      }
    }

    async function getRecentOrders() {
      try {
        const orders = await prisma.orderRequest.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            user: { select: { firstName: true, lastName: true } }
          }
        });
        
        if (orders.length === 0) {
          return '<div class="empty-list">Нет заказов</div>';
        }
        
        return orders.map(order => `
          <div class="list-item">
            <div class="list-info">
              <div class="list-name">Заказ #${order.id}</div>
              <div class="list-time">${order.createdAt.toLocaleString('ru-RU')}</div>
            </div>
            <div>${order.user?.firstName || 'Пользователь'}</div>
          </div>
        `).join('');
      } catch (error) {
        return '<div class="empty-list">Ошибка загрузки</div>';
      }
    }

    async function getRecentTransactions() {
      try {
        const transactions = await prisma.partnerTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            profile: {
              include: {
                user: { select: { firstName: true, lastName: true } }
              }
            }
          }
        });
        
        if (transactions.length === 0) {
          return '<div class="empty-list">Нет транзакций</div>';
        }
        
        return transactions.map(tx => `
          <div class="list-item">
            <div class="list-info">
              <div class="list-name">${tx.profile.user.firstName || 'Партнёр'}</div>
              <div class="list-time">${tx.createdAt.toLocaleString('ru-RU')}</div>
              <div style="font-size: 11px; color: #999; margin-top: 2px;">${tx.description}</div>
            </div>
            <div class="list-amount ${tx.amount < 0 ? 'negative' : ''}">
              ${tx.amount > 0 ? '+' : ''}${tx.amount.toFixed(2)} PZ
            </div>
          </div>
        `).join('');
      } catch (error) {
        return '<div class="empty-list">Ошибка загрузки</div>';
      }
    }

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
          
          /* Recent Lists Styles */
          .recent-lists { margin: 30px 0; }
          .list-section { margin-bottom: 25px; }
          .list-section h3 { margin-bottom: 15px; color: #333; font-size: 18px; }
          .list-container { 
            background: #f8f9fa; 
            border: 1px solid #e9ecef; 
            border-radius: 8px; 
            padding: 15px; 
            max-height: 200px; 
            overflow-y: auto; 
          }
          .list-item { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 8px 0; 
            border-bottom: 1px solid #e9ecef; 
          }
          .list-item:last-child { border-bottom: none; }
          .list-item:hover { background: #e9ecef; }
          .list-info { flex: 1; }
          .list-name { font-weight: 600; color: #333; }
          .list-time { color: #6c757d; font-size: 0.9em; }
          .list-amount { font-weight: bold; color: #28a745; }
          .list-amount.negative { color: #dc3545; }
          .empty-list { text-align: center; color: #6c757d; padding: 20px; }
          
          /* Detailed Users Table Styles */
          .detailed-users-container { margin: 20px 0; }
          .users-table-container { overflow-x: auto; }
          .users-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .users-table th { background: #f8f9fa; padding: 15px 12px; text-align: left; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; }
          .users-table td { padding: 15px 12px; border-bottom: 1px solid #dee2e6; vertical-align: top; }
          .users-table tr:hover { background: #f8f9fa; }
          
          .user-info { display: flex; align-items: center; gap: 12px; }
          .user-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; }
          .user-details h4 { margin: 0; font-size: 16px; color: #212529; }
          .user-details p { margin: 2px 0 0 0; font-size: 13px; color: #6c757d; }
          
          .balance { font-weight: bold; font-size: 16px; }
          .balance.positive { color: #28a745; }
          .balance.zero { color: #6c757d; }
          
          .partners-count { background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          .orders-sum { background: #fff3cd; color: #856404; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          
          .action-btn { background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 2px; }
          .action-btn:hover { background: #0056b3; }
          .action-btn.hierarchy { background: #28a745; }
          .action-btn.hierarchy:hover { background: #1e7e34; }
          
          /* Table Controls Styles */
          .table-controls { background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #dee2e6; }
          .sort-controls label { font-weight: 600; margin-right: 10px; }
          .sort-controls select { margin-right: 10px; padding: 5px; border: 1px solid #ced4da; border-radius: 4px; }
          .message-controls { display: flex; gap: 10px; }
          .message-controls .btn { padding: 8px 12px; font-size: 14px; }
          
          /* Checkbox Styles */
          .user-checkbox { transform: scale(1.2); cursor: pointer; }
          #selectAll { transform: scale(1.2); cursor: pointer; }
          
          /* Sortable Headers */
          th[onclick] { user-select: none; }
          th[onclick]:hover { background: #e9ecef; }
          
          /* Message Composer Modal */
          .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); }
          .modal-content { background-color: white; margin: 5% auto; padding: 20px; border-radius: 8px; width: 80%; max-width: 600px; max-height: 80vh; overflow-y: auto; }
          .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .close { color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; }
          .close:hover { color: #000; }
          .form-group { margin-bottom: 15px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: 600; }
          .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; }
          .form-group textarea { height: 100px; resize: vertical; }
          .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
          
          /* Product Form Styles */
          .product-modal { max-width: 920px; width: min(920px, 92%); padding: 28px 32px; }
          .product-form { display: flex; flex-direction: column; gap: 24px; }
          .product-section { background: #f8f9fb; border: 1px solid #e9ecef; border-radius: 12px; padding: 20px 24px; box-shadow: 0 18px 22px -18px rgba(15, 23, 42, 0.35); }
          .product-section-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 18px; }
          .product-section-title { font-size: 17px; font-weight: 600; color: #212529; }
          .product-section-subtitle { font-size: 13px; color: #6c757d; }
          .product-grid { display: grid; gap: 18px; }
          .product-grid.two-columns { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
          .product-grid.three-columns { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
          @media (min-width: 900px) {
            .product-grid.three-columns { grid-template-columns: repeat(3, 1fr); }
          }
          .product-grid.media-layout { grid-template-columns: repeat(2, 1fr); align-items: stretch; }
          .product-form textarea { resize: vertical; }
          #productShortDescription { min-height: 220px; }
          #productFullDescription { min-height: 220px; }
          .category-picker { display: flex; gap: 12px; }
          .category-picker select { flex: 1; }
          .category-picker .btn { padding: 8px 14px; border-radius: 8px; }
          .regions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
          .regions-grid label { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: linear-gradient(135deg, #f8f9fa, #eef1f6); border-radius: 10px; cursor: pointer; border: 1px solid #e1e5eb; transition: all 0.2s ease; }
          .regions-grid label:hover { border-color: #cfd6df; box-shadow: 0 8px 18px -12px rgba(41, 72, 125, 0.45); }
          .switch-row input { transform: scale(1.2); }
          .char-count { text-align: right; font-size: 12px; color: #6c757d; margin-top: 5px; }
          .file-info { font-size: 12px; color: #6c757d; }
          .product-media { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: center; }
          .image-preview { width: 220px; height: 220px; border-radius: 12px; background: #f1f3f5 center/cover no-repeat; border: 1px solid #dee2e6; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6); }
          .image-controls { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
          .image-controls input[type="file"] { cursor: pointer; }
          .image-controls .file-info { margin-top: 4px; }
          .media-group label { margin-bottom: 10px; display: block; }
          .status-toggle { display: inline-flex; align-items: center; gap: 12px; font-weight: 500; color: #343a40; cursor: pointer; }
          .status-toggle input { transform: scale(1.15); }
          @media (max-width: 768px) {
            .product-modal { width: 94%; padding: 20px; }
            .product-section { padding: 18px 20px; }
            .product-media { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Админ-панель Plazma Water v2.0</h1>
            <p>Единое управление ботом, пользователями и партнёрами</p>
          </div>
          
          ${req.query.success === 'all_bonuses_recalculated' ? `<div class="alert alert-success">✅ Все бонусы пересчитаны! Общий баланс: ${req.query.total || 0} PZ</div>` : ''}
          ${req.query.error === 'bonus_recalculation' ? '<div class="alert alert-error">❌ Ошибка при пересчёте бонусов</div>' : ''}
          
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

            <!-- Detailed Users Section -->
            <div class="section-header">
              <h2 class="section-title">👥 Детальная информация о пользователях</h2>
            </div>
            
            ${await getDetailedUsersSection()}

            <!-- Recent Data Lists -->
            <div class="recent-lists">
              <div class="list-section">
                <h3>👥 Последние пользователи</h3>
                <div class="list-container">
                  ${await getRecentUsers()}
                </div>
              </div>
              
              <div class="list-section">
                <h3>📦 Последние заказы</h3>
                <div class="list-container">
                  ${await getRecentOrders()}
                </div>
              </div>
              
              <div class="list-section">
                <h3>💰 Последние транзакции</h3>
                <div class="list-container">
                  <div class="total-balance-header" style="background: #e8f5e8; padding: 10px; margin-bottom: 10px; border-radius: 6px; text-align: center; border: 2px solid #28a745;">
                    <div style="font-size: 18px; font-weight: bold; color: #28a745;">
                      💰 Общий баланс: ${totalBalance.toFixed(2)} PZ
                    </div>
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">
                      Сумма всех балансов партнёров
                    </div>
                  </div>
                  ${await getRecentTransactions()}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Users Tab -->
          <div id="users" class="tab-content">
            <div class="section-header">
              <h2 class="section-title">👥 Управление пользователями v2.0</h2>
              <div class="action-buttons">
                <a href="/admin/users-detailed" class="btn">👥 Детальная информация</a>
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
                <button class="btn" onclick="openAddProductModal()" style="background: #28a745;">➕ Добавить товар</button>
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
              <a href="/admin/force-recalculate-all-bonuses" class="btn" style="background: #28a745;">🔄 Пересчитать все бонусы</a>
            </div>
            </div>
            <p>Дополнительные инструменты для отладки и тестирования.</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="/admin/logout" class="btn" style="background: #dc3545;">Выйти</a>
          </div>
        </div>
        
        <!-- Message Composer Modal -->
        <div id="messageModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2>📨 Отправить сообщение пользователям</h2>
              <span class="close" onclick="closeMessageComposer()">&times;</span>
            </div>
            
            <div class="form-group">
              <label>Выбранные получатели:</label>
              <div id="selectedUsers" style="background: #f8f9fa; padding: 10px; border-radius: 4px; max-height: 100px; overflow-y: auto;"></div>
            </div>
            
            <div class="form-group">
              <label>Тип сообщения:</label>
              <select id="messageType">
                <option value="text">Текстовое сообщение</option>
                <option value="notification">Уведомление</option>
                <option value="promotion">Акция/Предложение</option>
                <option value="system">Системное сообщение</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>Тема сообщения:</label>
              <input type="text" id="messageSubject" placeholder="Введите тему сообщения">
            </div>
            
            <div class="form-group">
              <label>Текст сообщения:</label>
              <textarea id="messageText" placeholder="Введите текст сообщения" required></textarea>
            </div>
            
            <div class="form-group">
              <label>
                <input type="checkbox" id="includeButtons"> Включить кнопки действий
              </label>
            </div>
            
            <div id="buttonsSection" style="display: none;">
              <div class="form-group">
                <label>Кнопка 1:</label>
                <input type="text" id="button1Text" placeholder="Текст кнопки">
                <input type="text" id="button1Url" placeholder="URL или команда">
              </div>
              <div class="form-group">
                <label>Кнопка 2:</label>
                <input type="text" id="button2Text" placeholder="Текст кнопки">
                <input type="text" id="button2Url" placeholder="URL или команда">
              </div>
            </div>
            
            <div class="modal-footer">
              <button class="btn" onclick="closeMessageComposer()" style="background: #6c757d;">Отмена</button>
              <button class="btn" onclick="sendMessages()" style="background: #28a745;">📤 Отправить</button>
            </div>
          </div>
        </div>

        <!-- Add Product Modal -->
        <div id="addProductModal" class="modal">
          <div class="modal-content product-modal">
            <div class="modal-header">
              <h2>➕ Добавить новый товар</h2>
              <span class="close" onclick="closeAddProductModal()">&times;</span>
            </div>
            
            <form id="addProductForm" class="product-form">
              <div class="product-section">
                <div class="product-section-header">
                  <span class="product-section-title">Основные параметры</span>
                  <span class="product-section-subtitle">Название, стоимость и наличие товара</span>
                </div>
                <div class="product-grid three-columns">
                  <div class="form-group">
                    <label>Название товара *</label>
                    <input type="text" id="productName" required placeholder="Введите название товара">
                  </div>
                  <div class="form-group">
                    <label>Цена (₽) *</label>
                    <input type="number" id="productPriceRub" step="1" min="0" required placeholder="0">
                    <div class="char-count">1 PZ = 100 ₽</div>
                  </div>
                  <div class="form-group">
                    <label>Цена (PZ) *</label>
                    <input type="number" id="productPrice" step="0.01" min="0" required placeholder="0.00">
                    <div class="char-count">1 PZ = 100 ₽</div>
                  </div>
                  <div class="form-group">
                    <label>Категория *</label>
                    <div class="category-picker">
                      <select id="productCategory" required>
                        <option value="">Выберите категорию</option>
                      </select>
                      <button type="button" class="btn" onclick="openAddCategoryModal()" style="background: #17a2b8;">+</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Количество на складе</label>
                    <input type="number" id="productStock" min="0" placeholder="0">
                  </div>
                </div>
              </div>

              <div class="product-section">
                <div class="product-section-header">
                  <span class="product-section-title">Доставка</span>
                  <span class="product-section-subtitle">Выберите регионы, где товар доступен</span>
                </div>
                <div class="regions-grid">
                  <label class="switch-row"><input type="checkbox" id="regionRussia" checked> 🇷🇺 Россия</label>
                  <label class="switch-row"><input type="checkbox" id="regionBali"> 🇮🇩 Бали</label>
                </div>
              </div>

              <div class="product-section">
                <div class="product-section-header">
                  <span class="product-section-title">Описание и медиа</span>
                  <span class="product-section-subtitle">Добавьте текст и изображение для карточки товара</span>
                </div>
                <div class="product-grid media-layout">
                  <div class="form-group">
                    <label>Краткое описание *</label>
                    <textarea id="productShortDescription" required placeholder="Краткое описание товара (до 200 символов)" maxlength="200"></textarea>
                    <div class="char-count" id="shortDescCount">0/200</div>
                  </div>
                  <div class="form-group media-group">
                    <label>Фото товара</label>
                    <div class="product-media">
                      <div id="imagePreview" class="image-preview"></div>
                      <div class="image-controls">
                        <input type="file" id="productImage" accept="image/*">
                        <div class="file-info">Квадратное фото 1:1, ~800x800px, JPG/PNG</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="form-group">
                  <label>Полное описание *</label>
                  <textarea id="productFullDescription" required placeholder="Подробное описание товара"></textarea>
                </div>
              </div>

              <div class="product-section">
                <div class="product-section-header">
                  <span class="product-section-title">Публикация</span>
                  <span class="product-section-subtitle">Управляйте доступностью товара</span>
                </div>
                <div class="form-group">
                  <label class="status-toggle">
                    <input type="checkbox" id="productActive"> Товар активен (доступен для покупки)
                  </label>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn" onclick="closeAddProductModal()" style="background: #6c757d;">Отмена</button>
                <button type="submit" class="btn" style="background: #28a745;">💾 Создать товар</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Add Category Modal -->
        <div id="addCategoryModal" class="modal">
          <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
              <h2>📂 Добавить новую категорию</h2>
              <span class="close" onclick="closeAddCategoryModal()">&times;</span>
            </div>
            
            <form id="addCategoryForm">
              <div class="form-group">
                <label>Название категории *</label>
                <input type="text" id="categoryName" required placeholder="Введите название категории">
              </div>
              
              <div class="form-group">
                <label>Описание категории</label>
                <textarea id="categoryDescription" placeholder="Описание категории" style="height: 80px;"></textarea>
              </div>
              
              <div class="form-group">
                <label>Иконка категории</label>
                <input type="text" id="categoryIcon" placeholder="Эмодзи или текст (например: 🍎)">
              </div>
              
              <div class="modal-footer">
                <button type="button" class="btn" onclick="closeAddCategoryModal()" style="background: #6c757d;">Отмена</button>
                <button type="submit" class="btn" style="background: #17a2b8;">📂 Создать категорию</button>
              </div>
            </form>
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
          
          function showHierarchy(userId) {
            window.open(\`/admin/partners-hierarchy?user=\${userId}\`, '_blank', 'width=800,height=600');
          }
          
          function showUserDetails(userId) {
            window.open(\`/admin/users/\${userId}\`, '_blank', 'width=600,height=400');
          }
          
          // Sorting functionality
          function sortTable(column) {
            const sortBy = document.getElementById('sortBy');
            const sortOrder = document.getElementById('sortOrder');
            
            // Set the sort parameters
            switch(column) {
              case 'name': sortBy.value = 'name'; break;
              case 'balance': sortBy.value = 'balance'; break;
              case 'partners': sortBy.value = 'partners'; break;
              case 'orders': sortBy.value = 'orders'; break;
              case 'activity': sortBy.value = 'activity'; break;
            }
            
            applySorting();
          }
          
          function applySorting() {
            const sortBy = document.getElementById('sortBy').value;
            const sortOrder = document.getElementById('sortOrder').value;
            const tbody = document.querySelector('.users-table tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            rows.sort((a, b) => {
              let aVal, bVal;
              
              switch(sortBy) {
                case 'name':
                  aVal = a.dataset.name.toLowerCase();
                  bVal = b.dataset.name.toLowerCase();
                  break;
                case 'balance':
                  aVal = parseFloat(a.dataset.balance);
                  bVal = parseFloat(b.dataset.balance);
                  break;
                case 'partners':
                  aVal = parseInt(a.dataset.partners);
                  bVal = parseInt(b.dataset.partners);
                  break;
                case 'orders':
                  aVal = parseFloat(a.dataset.orders);
                  bVal = parseFloat(b.dataset.orders);
                  break;
                case 'activity':
                  aVal = parseInt(a.dataset.activity);
                  bVal = parseInt(b.dataset.activity);
                  break;
                default:
                  return 0;
              }
              
              if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
              } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
              }
            });
            
            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
          }
          
          // Checkbox functionality
          function toggleAllUsers() {
            const selectAll = document.getElementById('selectAll');
            const checkboxes = document.querySelectorAll('.user-checkbox');
            checkboxes.forEach(cb => cb.checked = selectAll.checked);
          }
          
          function selectAllUsers() {
            const checkboxes = document.querySelectorAll('.user-checkbox');
            checkboxes.forEach(cb => cb.checked = true);
            document.getElementById('selectAll').checked = true;
          }
          
          function deselectAllUsers() {
            const checkboxes = document.querySelectorAll('.user-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
            document.getElementById('selectAll').checked = false;
          }
          
          // Message composer functionality
          function openMessageComposer() {
            const selectedUsers = getSelectedUsers();
            if (selectedUsers.length === 0) {
              alert('Выберите пользователей для отправки сообщения');
              return;
            }
            
            document.getElementById('selectedUsers').innerHTML = selectedUsers.map(u => 
              \`<span style="background: #e3f2fd; padding: 2px 8px; border-radius: 12px; margin: 2px; display: inline-block;">\${u.name}</span>\`
            ).join('');
            
            document.getElementById('messageModal').style.display = 'block';
          }
          
          function closeMessageComposer() {
            document.getElementById('messageModal').style.display = 'none';
          }
          
          function getSelectedUsers() {
            const checkboxes = document.querySelectorAll('.user-checkbox:checked');
            return Array.from(checkboxes).map(cb => {
              const row = cb.closest('tr');
              return {
                id: cb.value,
                name: row.dataset.name
              };
            });
          }
          
          function sendMessages() {
            const selectedUsers = getSelectedUsers();
            const messageType = document.getElementById('messageType').value;
            const subject = document.getElementById('messageSubject').value;
            const text = document.getElementById('messageText').value;
            
            if (!text.trim()) {
              alert('Введите текст сообщения');
              return;
            }
            
            // Send to server
            fetch('/admin/send-messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userIds: selectedUsers.map(u => u.id),
                type: messageType,
                subject: subject,
                text: text,
                includeButtons: document.getElementById('includeButtons').checked,
                button1: {
                  text: document.getElementById('button1Text').value,
                  url: document.getElementById('button1Url').value
                },
                button2: {
                  text: document.getElementById('button2Text').value,
                  url: document.getElementById('button2Url').value
                }
              })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                let message = data.message;
                if (data.errors && data.errors.length > 0) {
                  message += '\\n\\nОшибки:\\n' + data.errors.slice(0, 3).join('\\n');
                  if (data.errors.length > 3) {
                    message += '\\n... и еще ' + (data.errors.length - 3) + ' ошибок';
                  }
                }
                alert(message);
                closeMessageComposer();
              } else {
                alert('Ошибка при отправке: ' + data.error);
              }
            })
            .catch(error => {
              alert('Ошибка: ' + error.message);
            });
          }
          
          // Show/hide buttons section
          document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('includeButtons').addEventListener('change', function() {
              const buttonsSection = document.getElementById('buttonsSection');
              buttonsSection.style.display = this.checked ? 'block' : 'none';
            });
            
            // Load categories when product modal opens
            document.getElementById('addProductModal').addEventListener('shown.bs.modal', loadCategories);
            
            // Character counter for short description
            const shortDesc = document.getElementById('productShortDescription');
            const charCount = document.getElementById('shortDescCount');
            if (shortDesc && charCount) {
              shortDesc.addEventListener('input', function() {
                charCount.textContent = this.value.length + '/200';
              });
            }

            // Image preview
            const imageInput = document.getElementById('productImage');
            const imagePreview = document.getElementById('imagePreview');
            if (imageInput && imagePreview) {
              imageInput.addEventListener('change', function() {
                const inputEl = this;
                const file = inputEl && inputEl.files ? inputEl.files[0] : null;
                if (!file) { imagePreview.style.backgroundImage = ''; return; }
                const reader = new FileReader();
                reader.onload = function() { imagePreview.style.backgroundImage = 'url(' + reader.result + ')'; };
                reader.readAsDataURL(file);
              });
            }
          });
          
          // Product modal functions
          function openAddProductModal() {
            document.getElementById('addProductModal').style.display = 'block';
            loadCategories();
          }
          
          function closeAddProductModal() {
            document.getElementById('addProductModal').style.display = 'none';
            document.getElementById('addProductForm').reset();
            document.getElementById('shortDescCount').textContent = '0/200';
          }
          
          function openAddCategoryModal() {
            document.getElementById('addCategoryModal').style.display = 'block';
          }
          
          function closeAddCategoryModal() {
            document.getElementById('addCategoryModal').style.display = 'none';
            document.getElementById('addCategoryForm').reset();
          }
          
          // Load categories for product form
          async function loadCategories() {
            try {
              const response = await fetch('/admin/api/categories');
              const categories = await response.json();
              
              const select = document.getElementById('productCategory');
              select.innerHTML = '<option value="">Выберите категорию</option>';
              
              categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.icon ? category.icon + ' ' + category.name : category.name;
                select.appendChild(option);
              });
            } catch (error) {
              console.error('Error loading categories:', error);
            }
          }
          
          // Handle product form submission
          document.getElementById('addProductForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData();
            formData.append('name', document.getElementById('productName').value);
            formData.append('price', document.getElementById('productPrice').value);
            formData.append('categoryId', document.getElementById('productCategory').value);
            formData.append('stock', document.getElementById('productStock').value || 0);
            formData.append('shortDescription', document.getElementById('productShortDescription').value);
            formData.append('fullDescription', document.getElementById('productFullDescription').value);
            formData.append('active', document.getElementById('productActive').checked);
            
            // Regions
            var rrEl = document.getElementById('regionRussia');
            var rbEl = document.getElementById('regionBali');
            formData.append('availableInRussia', String(rrEl && rrEl['checked']));
            formData.append('availableInBali', String(rbEl && rbEl['checked']));
            
            // Add image if selected
            const imageFile = document.getElementById('productImage').files[0];
            if (imageFile) {
              formData.append('image', imageFile);
            }
            
            try {
              const response = await fetch('/admin/api/products', {
                method: 'POST',
                body: formData
              });
              
              const result = await response.json();
              
              if (result.success) {
                alert('✅ Товар успешно создан!');
                closeAddProductModal();
                // Refresh the page to show new product
                window.location.reload();
              } else {
                alert('❌ Ошибка при создании товара: ' + result.error);
              }
            } catch (error) {
              alert('❌ Ошибка: ' + error.message);
            }
          });
          
          // Handle category form submission
          document.getElementById('addCategoryForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const categoryData = {
              name: document.getElementById('categoryName').value,
              description: document.getElementById('categoryDescription').value,
              icon: document.getElementById('categoryIcon').value
            };
            
            try {
              const response = await fetch('/admin/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(categoryData)
              });
              
              const result = await response.json();
              
              if (result.success) {
                alert('✅ Категория успешно создана!');
                closeAddCategoryModal();
                // Reload categories in product form
                loadCategories();
              } else {
                alert('❌ Ошибка при создании категории: ' + result.error);
              }
            } catch (error) {
              alert('❌ Ошибка: ' + error.message);
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

// Detailed users management with sorting and filtering
router.get('/users-detailed', requireAdmin, async (req, res) => {
  try {
    const sortBy = req.query.sort as string || 'activity';
    const sortOrder = req.query.order as string || 'desc';
    
    // Get all users with their related data
    const users = await prisma.user.findMany({
      include: {
        partner: {
          include: {
            referrals: true,
            transactions: true
          }
        },
        orders: true
      },
      orderBy: {
        createdAt: sortOrder === 'desc' ? 'desc' : 'asc'
      }
    });

    // Calculate additional data for each user
    const usersWithStats = users.map((user: any) => {
      const partnerProfile = user.partner;
      const directPartners = partnerProfile?.referrals?.length || 0;
      const totalOrderSum = user.orders?.reduce((sum: number, order: any) => {
        // Parse itemsJson to calculate total
        try {
          const items = JSON.parse(order.itemsJson || '[]');
          const orderTotal = items.reduce((itemSum: number, item: any) => itemSum + (item.price || 0) * (item.quantity || 1), 0);
          return sum + orderTotal;
        } catch {
          return sum;
        }
      }, 0) || 0;
      const balance = partnerProfile?.balance || 0;
      const bonus = partnerProfile?.bonus || 0;
      const lastActivity = user.updatedAt || user.createdAt;
      
      return {
        ...user,
        directPartners,
        totalOrderSum,
        balance,
        bonus,
        lastActivity
      };
    });

    // Apply sorting
    let sortedUsers = usersWithStats;
    if (sortBy === 'balance') {
      sortedUsers = usersWithStats.sort((a, b) => 
        sortOrder === 'desc' ? b.balance - a.balance : a.balance - b.balance
      );
    } else if (sortBy === 'partners') {
      sortedUsers = usersWithStats.sort((a, b) => 
        sortOrder === 'desc' ? b.directPartners - a.directPartners : a.directPartners - b.directPartners
      );
    } else if (sortBy === 'orders') {
      sortedUsers = usersWithStats.sort((a, b) => 
        sortOrder === 'desc' ? b.totalOrderSum - a.totalOrderSum : a.totalOrderSum - b.totalOrderSum
      );
    } else if (sortBy === 'activity') {
      sortedUsers = usersWithStats.sort((a, b) => 
        sortOrder === 'desc' ? new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime() : 
                               new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime()
      );
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Детальная информация о пользователях - Plazma Water Admin</title>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
          .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 16px; }
          
          .controls { padding: 20px; background: #f8f9fa; border-bottom: 1px solid #e9ecef; }
          .sort-controls { display: flex; gap: 15px; align-items: center; flex-wrap: wrap; }
          .sort-group { display: flex; gap: 10px; align-items: center; }
          .sort-group label { font-weight: 600; color: #495057; }
          .sort-group select, .sort-group button { padding: 8px 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; }
          .sort-group button { background: #007bff; color: white; border: none; cursor: pointer; }
          .sort-group button:hover { background: #0056b3; }
          
          .stats-bar { display: flex; gap: 20px; padding: 15px 20px; background: #e3f2fd; border-bottom: 1px solid #bbdefb; }
          .stat-item { text-align: center; }
          .stat-number { font-size: 24px; font-weight: bold; color: #1976d2; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
          
          .users-table { width: 100%; border-collapse: collapse; }
          .users-table th { background: #f8f9fa; padding: 15px 12px; text-align: left; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; }
          .users-table td { padding: 15px 12px; border-bottom: 1px solid #dee2e6; vertical-align: top; }
          .users-table tr:hover { background: #f8f9fa; }
          
          .user-info { display: flex; align-items: center; gap: 12px; }
          .user-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; }
          .user-details h4 { margin: 0; font-size: 16px; color: #212529; }
          .user-details p { margin: 2px 0 0 0; font-size: 13px; color: #6c757d; }
          
          .balance { font-weight: bold; font-size: 16px; }
          .balance.positive { color: #28a745; }
          .balance.zero { color: #6c757d; }
          
          .partners-count { background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          .orders-sum { background: #fff3cd; color: #856404; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          
          .action-btn { background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 2px; }
          .action-btn:hover { background: #0056b3; }
          .action-btn.hierarchy { background: #28a745; }
          .action-btn.hierarchy:hover { background: #1e7e34; }
          
          .back-btn { background: #6c757d; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; display: inline-block; margin-bottom: 20px; }
          .back-btn:hover { background: #5a6268; }
          
          .empty-state { text-align: center; padding: 60px 20px; color: #6c757d; }
          .empty-state h3 { margin: 0 0 10px 0; font-size: 24px; }
          .empty-state p { margin: 0; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>👥 Детальная информация о пользователях</h1>
            <p>Полная статистика, балансы, партнёры и заказы</p>
          </div>
          
          <div class="controls">
            <div class="sort-controls">
              <div class="sort-group">
                <label>Сортировать по:</label>
                <select id="sortSelect">
                  <option value="activity" ${sortBy === 'activity' ? 'selected' : ''}>Активности</option>
                  <option value="balance" ${sortBy === 'balance' ? 'selected' : ''}>Балансу</option>
                  <option value="partners" ${sortBy === 'partners' ? 'selected' : ''}>Количеству партнёров</option>
                  <option value="orders" ${sortBy === 'orders' ? 'selected' : ''}>Сумме заказов</option>
                </select>
              </div>
              
              <div class="sort-group">
                <label>Порядок:</label>
                <select id="orderSelect">
                  <option value="desc" ${sortOrder === 'desc' ? 'selected' : ''}>По убыванию</option>
                  <option value="asc" ${sortOrder === 'asc' ? 'selected' : ''}>По возрастанию</option>
                </select>
              </div>
              
              <button onclick="applySorting()">🔄 Применить</button>
            </div>
          </div>
          
          <div class="stats-bar">
            <div class="stat-item">
              <div class="stat-number">${sortedUsers.length}</div>
              <div class="stat-label">Всего пользователей</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">${sortedUsers.filter(u => u.balance > 0).length}</div>
              <div class="stat-label">С балансом</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">${sortedUsers.filter(u => u.directPartners > 0).length}</div>
              <div class="stat-label">Партнёры</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">${sortedUsers.reduce((sum, u) => sum + u.totalOrderSum, 0).toFixed(2)} PZ</div>
              <div class="stat-label">Общая сумма заказов</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">${sortedUsers.reduce((sum, u) => sum + u.balance, 0).toFixed(2)} PZ</div>
              <div class="stat-label">Общий баланс партнёров</div>
            </div>
          </div>
          
          ${sortedUsers.length === 0 ? `
            <div class="empty-state">
              <h3>📭 Нет пользователей</h3>
              <p>Пользователи появятся здесь после регистрации</p>
            </div>
          ` : `
            <table class="users-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Баланс</th>
                  <th>Партнёры</th>
                  <th>Заказы</th>
                  <th>Последняя активность</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                ${sortedUsers.map(user => `
                  <tr>
                    <td>
                      <div class="user-info">
                        <div class="user-avatar">${(user.firstName || 'U')[0].toUpperCase()}</div>
                        <div class="user-details">
                          <h4>${user.firstName || 'Без имени'} ${user.lastName || ''}</h4>
                          <p>@${user.username || 'без username'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div class="balance ${user.balance > 0 ? 'positive' : 'zero'}">
                        ${user.balance.toFixed(2)} PZ
                      </div>
                      ${user.bonus > 0 ? `<div style="font-size: 11px; color: #6c757d;">Бонусы: ${user.bonus.toFixed(2)} PZ</div>` : ''}
                    </td>
                    <td>
                      <div class="partners-count">${user.directPartners} прямых</div>
                    </td>
                    <td>
                      <div class="orders-sum">${user.totalOrderSum.toFixed(2)} PZ</div>
                      <div style="font-size: 11px; color: #6c757d;">${user.orders?.length || 0} заказов</div>
                    </td>
                    <td>
                      <div style="font-size: 13px; color: #6c757d;">
                        ${user.lastActivity.toLocaleString('ru-RU')}
                      </div>
                    </td>
                    <td>
                      ${user.partner ? `
                        <button class="action-btn hierarchy" onclick="showHierarchy('${user.id}')">
                          🌳 Иерархия
                        </button>
                      ` : ''}
                      <button class="action-btn" onclick="showUserDetails('${user.id}')">
                        👁 Подробно
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
          
          <div style="padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
            <a href="/admin" class="back-btn">← Назад в админ-панель</a>
          </div>
        </div>
        
        <script>
          function applySorting() {
            const sortBy = document.getElementById('sortSelect').value;
            const order = document.getElementById('orderSelect').value;
            window.location.href = \`/admin/users-detailed?sort=\${sortBy}&order=\${order}\`;
          }
          
          function showHierarchy(userId) {
            window.open(\`/admin/partners-hierarchy?user=\${userId}\`, '_blank', 'width=800,height=600');
          }
          
          function showUserDetails(userId) {
            window.open(\`/admin/users/\${userId}\`, '_blank', 'width=600,height=400');
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Detailed users page error:', error);
    res.status(500).send('Ошибка загрузки страницы пользователей');
  }
});

// Send messages to users
router.post('/send-messages', requireAdmin, async (req, res) => {
  try {
    const { userIds, type, subject, text, includeButtons, button1, button2 } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Не выбраны получатели' });
    }
    
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Не указан текст сообщения' });
    }
    
    // Get bot instance for real message sending
    const { getBotInstance } = await import('../lib/bot-instance.js');
    const bot = await getBotInstance();
    
    let sentCount = 0;
    let errors = [];
    
    // Send messages to each user
    for (const userId of userIds) {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          errors.push(`Пользователь ${userId} не найден`);
          continue;
        }
        
        // Build message text
        let messageText = '';
        if (subject) {
          messageText += `📢 **${subject}**\n\n`;
        }
        messageText += text;
        
        // Add type indicator
        const typeEmojiMap: { [key: string]: string } = {
          'text': '💬',
          'notification': '🔔',
          'promotion': '🎉',
          'system': '⚙️'
        };
        const typeEmoji = typeEmojiMap[type] || '💬';
        
        messageText = `${typeEmoji} ${messageText}`;
        
        // Send message via Telegram bot
        try {
          await bot.telegram.sendMessage(user.telegramId, messageText, {
            parse_mode: 'Markdown'
          });
          
          // Add buttons if requested
          if (includeButtons && (button1.text || button2.text)) {
            const buttons = [];
            if (button1.text) {
              buttons.push([{ text: button1.text, url: button1.url }]);
            }
            if (button2.text) {
              buttons.push([{ text: button2.text, url: button2.url }]);
            }
            
            if (buttons.length > 0) {
              await bot.telegram.sendMessage(user.telegramId, '👇 Выберите действие:', {
                reply_markup: { inline_keyboard: buttons }
              });
            }
          }
          
          console.log(`✅ Message sent to user ${user.firstName} (${user.id})`);
          
        } catch (telegramError) {
          console.error(`❌ Telegram error for user ${user.id}:`, telegramError);
          const telegramErrorMessage = telegramError instanceof Error ? telegramError.message : String(telegramError);
          errors.push(`Ошибка Telegram для ${user.firstName}: ${telegramErrorMessage}`);
          continue;
        }
        
        // Log successful message
        await prisma.userHistory.create({
          data: {
            userId: user.id,
            action: 'admin_message_sent',
            payload: {
              type,
              subject,
              messageLength: text.length,
              hasButtons: includeButtons,
              messageText: messageText,
              status: 'sent',
              telegramId: user.telegramId
            }
          }
        });
        
        sentCount++;
        
      } catch (error) {
        console.error(`Error sending message to user ${userId}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Ошибка отправки пользователю ${userId}: ${errorMessage}`);
      }
    }
    
    res.json({
      success: true,
      sent: sentCount,
      total: userIds.length,
      failed: userIds.length - sentCount,
      errors: errors.length > 0 ? errors : undefined,
      message: sentCount > 0 ? 
        `Успешно отправлено ${sentCount} из ${userIds.length} сообщений` : 
        'Не удалось отправить ни одного сообщения'
    });
    
  } catch (error) {
    console.error('Send messages error:', error);
    res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
  }
});

// API: Get categories
router.get('/api/categories', requireAdmin, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, error: 'Ошибка загрузки категорий' });
  }
});

// API: Create category
router.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Название категории обязательно' });
    }
    
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug: name.trim().toLowerCase().replace(/\s+/g, '-'),
        description: description?.trim() || '',
        isActive: true
      }
    });
    
    res.json({ success: true, category });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, error: 'Ошибка создания категории' });
  }
});

// API: Create product
router.post('/api/products', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, price, categoryId, stock, shortDescription, fullDescription, active, availableInRussia, availableInBali } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Название товара обязательно' });
    }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
      return res.status(400).json({ success: false, error: 'Цена должна быть положительным числом' });
    }
    if (!categoryId) {
      return res.status(400).json({ success: false, error: 'Выберите категорию' });
    }
    if (!shortDescription || !shortDescription.trim()) {
      return res.status(400).json({ success: false, error: 'Краткое описание обязательно' });
    }
    if (!fullDescription || !fullDescription.trim()) {
      return res.status(400).json({ success: false, error: 'Полное описание обязательно' });
    }
    
    // Regions parsing removed; using fixed switches on client side
    
    // Check if category exists
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(400).json({ success: false, error: 'Категория не найдена' });
    }
    
    // Handle image upload (if provided)
    let imageUrl = '';
    if (req.file) {
      try {
        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'auto', folder: 'plazma-products' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.file!.buffer);
        });
        
        imageUrl = (result as any).secure_url;
      } catch (error) {
        console.error('Image upload error:', error);
        return res.status(500).json({ success: false, error: 'Ошибка загрузки изображения' });
      }
    }
    
    // Create product
    const product = await prisma.product.create({
      data: {
        title: name.trim(),
        summary: shortDescription.trim(),
        description: fullDescription.trim(),
        price: parseFloat(price),
        categoryId,
        imageUrl,
        isActive: active === 'true' || active === true,
        availableInRussia: availableInRussia === 'true' || availableInRussia === true,
        availableInBali: availableInBali === 'true' || availableInBali === true
      }
    });
    
    res.json({ success: true, product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, error: 'Ошибка создания товара' });
  }
});

// Individual user details page
router.get('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        partner: {
          include: {
            referrals: true,
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        },
        orders: {
          orderBy: { createdAt: 'desc' }
        },
        histories: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!user) {
      return res.status(404).send('Пользователь не найден');
    }

    const partnerProfile = (user as any).partner;
    const directPartners = partnerProfile?.referrals?.length || 0;
    const totalOrderSum = (user as any).orders?.reduce((sum: number, order: any) => {
      // Parse itemsJson to calculate total
      try {
        const items = JSON.parse(order.itemsJson || '[]');
        const orderTotal = items.reduce((itemSum: number, item: any) => itemSum + (item.price || 0) * (item.quantity || 1), 0);
        return sum + orderTotal;
      } catch {
        return sum;
      }
    }, 0) || 0;
    const balance = partnerProfile?.balance || 0;
    const bonus = partnerProfile?.bonus || 0;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Детали пользователя - ${user.firstName || 'Без имени'}</title>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px; }
          .section { margin-bottom: 30px; }
          .section h3 { margin: 0 0 15px 0; color: #333; font-size: 18px; }
          .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
          .info-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
          .info-card h4 { margin: 0 0 8px 0; color: #495057; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-card p { margin: 0; font-size: 20px; font-weight: bold; color: #212529; }
          .balance { color: #28a745; }
          .balance.zero { color: #6c757d; }
          .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
          .table th { background: #f8f9fa; font-weight: 600; color: #495057; }
          .table tr:hover { background: #f8f9fa; }
          .back-btn { background: #6c757d; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; display: inline-block; margin-bottom: 20px; }
          .back-btn:hover { background: #5a6268; }
          .empty-state { text-align: center; padding: 40px; color: #6c757d; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>👤 ${user.firstName || 'Без имени'} ${user.lastName || ''}</h1>
            <p>@${user.username || 'без username'} • ID: ${user.id}</p>
          </div>
          
          <div class="content">
            <div class="section">
              <h3>📊 Основная информация</h3>
              <div class="info-grid">
                <div class="info-card">
                  <h4>Баланс</h4>
                  <p class="balance ${balance > 0 ? '' : 'zero'}">${balance.toFixed(2)} PZ</p>
                </div>
                <div class="info-card">
                  <h4>Всего бонусов</h4>
                  <p class="balance ${bonus > 0 ? '' : 'zero'}">${bonus.toFixed(2)} PZ</p>
                </div>
                <div class="info-card">
                  <h4>Прямых партнёров</h4>
                  <p>${directPartners}</p>
                </div>
                <div class="info-card">
                  <h4>Сумма заказов</h4>
                  <p>${totalOrderSum.toFixed(2)} PZ</p>
                </div>
                <div class="info-card">
                  <h4>Дата регистрации</h4>
                  <p>${user.createdAt.toLocaleString('ru-RU')}</p>
                </div>
                <div class="info-card">
                  <h4>Последняя активность</h4>
                  <p>${(user.updatedAt || user.createdAt).toLocaleString('ru-RU')}</p>
                </div>
              </div>
            </div>

            ${partnerProfile ? `
              <div class="section">
                <h3>🤝 Партнёрская информация (включая 2-й и 3-й уровень)</h3>
                <div class="info-grid">
                  <div class="info-card">
                    <h4>Тип программы</h4>
                    <p>${partnerProfile.programType === 'DIRECT' ? 'Прямая (25%)' : 'Многоуровневая (15%+5%+5%)'}</p>
                  </div>
                  <div class="info-card">
                    <h4>Реферальный код</h4>
                    <p>${partnerProfile.referralCode}</p>
                  </div>
                </div>
              </div>
            ` : ''}

            ${(user as any).orders && (user as any).orders.length > 0 ? `
              <div class="section">
                <h3>🛒 Последние заказы</h3>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Цена</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(user as any).orders.map((order: any) => {
                      try {
                        const items = JSON.parse(order.itemsJson || '[]');
                        const orderTotal = items.reduce((sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1), 0);
                        const itemNames = items.map((item: any) => `${item.name || 'Товар'} (${item.quantity || 1} шт.)`).join(', ');
                        return `
                          <tr>
                            <td>${itemNames || 'Заказ'}</td>
                            <td>${orderTotal.toFixed(2)} PZ</td>
                            <td>${order.createdAt.toLocaleString('ru-RU')}</td>
                          </tr>
                        `;
                      } catch {
                        return `
                          <tr>
                            <td>Заказ #${order.id}</td>
                            <td>0.00 PZ</td>
                            <td>${order.createdAt.toLocaleString('ru-RU')}</td>
                          </tr>
                        `;
                      }
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            ${partnerProfile?.transactions && partnerProfile.transactions.length > 0 ? `
              <div class="section">
                <h3>💰 Последние транзакции</h3>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Сумма</th>
                      <th>Описание</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${partnerProfile.transactions.map((tx: any) => `
                      <tr>
                        <td>${tx.type === 'CREDIT' ? '➕ Пополнение' : '➖ Списание'}</td>
                        <td class="${tx.type === 'CREDIT' ? 'balance' : ''}">${tx.amount.toFixed(2)} PZ</td>
                        <td>${tx.description}</td>
                        <td>${tx.createdAt.toLocaleString('ru-RU')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            ${(user as any).histories && (user as any).histories.length > 0 ? `
              <div class="section">
                <h3>📈 Последние действия</h3>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Действие</th>
                      <th>Данные</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(user as any).histories.map((action: any) => `
                      <tr>
                        <td>${action.action}</td>
                        <td>${action.payload ? JSON.stringify(action.payload) : '-'}</td>
                        <td>${action.createdAt.toLocaleString('ru-RU')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
          </div>
          
          <div style="padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
            <a href="/admin/users-detailed" class="back-btn">← Назад к списку</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ User details page error:', error);
    res.status(500).send('Ошибка загрузки деталей пользователя');
  }
});

// Force recalculate all partner bonuses
router.post('/force-recalculate-all-bonuses', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Starting force recalculation of all partner bonuses...');
    
    // Get all partner profiles
    const partners = await prisma.partnerProfile.findMany({
      include: { transactions: true }
    });
    
    console.log(`📊 Found ${partners.length} partner profiles to recalculate`);
    
    let totalRecalculated = 0;
    
    for (const partner of partners) {
      console.log(`🔄 Recalculating bonuses for partner ${partner.id}...`);
      
      // Calculate total from all transactions
      const totalBonus = partner.transactions.reduce((sum, tx) => {
        const amount = tx.type === 'CREDIT' ? tx.amount : -tx.amount;
        console.log(`  - Transaction: ${tx.type} ${tx.amount} PZ (${tx.description})`);
        return sum + amount;
      }, 0);
      
      console.log(`💰 Calculated total bonus for partner ${partner.id}: ${totalBonus} PZ`);
      
      // Update both balance and bonus fields
      await prisma.partnerProfile.update({
        where: { id: partner.id },
        data: {
          balance: totalBonus,
          bonus: totalBonus
        }
      });
      
      totalRecalculated += totalBonus;
      console.log(`✅ Updated partner ${partner.id}: balance = ${totalBonus} PZ, bonus = ${totalBonus} PZ`);
    }
    
    console.log(`🎉 Force recalculation completed! Total recalculated: ${totalRecalculated} PZ`);
    res.redirect('/admin?success=all_bonuses_recalculated&total=' + totalRecalculated);
  } catch (error) {
    console.error('❌ Force recalculate all bonuses error:', error);
    res.redirect('/admin?error=bonus_recalculation');
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
        
        <div style="background: linear-gradient(135deg, #e8f5e8 0%, #d4edda 100%); padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center; border: 3px solid #28a745; box-shadow: 0 4px 8px rgba(40, 167, 69, 0.2);">
          <h2 style="margin: 0 0 5px 0; color: #28a745; font-size: 28px;">💰 Общий баланс всех партнёров</h2>
          <div style="font-size: 36px; font-weight: bold; color: #155724; margin: 10px 0;">${totalBalance.toFixed(2)} PZ</div>
          <div style="font-size: 14px; color: #666; margin-top: 5px;">Сумма всех балансов партнёров в системе</div>
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
          <tr><th>Пользователь</th><th>Тип программы</th><th>Баланс</th><th>Всего бонусов</th><th>Партнёров</th><th>Код</th><th>Пригласитель</th><th>Создан</th><th>Действия</th></tr>
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
    const userId = req.query.user as string;
    
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

    // Build interactive hierarchy with multi-level referrals
    function buildInteractiveHierarchy() {
      const rootPartners = partnersWithInviters.filter(p => !p.inviter);
      
      function buildPartnerNode(partner: any, level = 0) {
        const levelEmoji = level === 0 ? '👑' : level === 1 ? '🥈' : level === 2 ? '🥉' : '📋';
        const partnerName = `${partner.user.firstName || ''} ${partner.user.lastName || ''}`.trim();
        const username = partner.user.username ? ` (@${partner.user.username})` : '';
        const balance = partner.balance.toFixed(2);
        
        // Count all referrals at all levels recursively
        function countAllReferrals(partnerId: string, visited = new Set()): number {
          if (visited.has(partnerId)) return 0; // Prevent infinite loops
          visited.add(partnerId);
          
          const directReferrals = partnersWithInviters.filter(p => 
            p.inviter && p.inviter.id === partnerId
          );
          
          let totalCount = directReferrals.length;
          
          // Recursively count referrals of referrals
          directReferrals.forEach(ref => {
            totalCount += countAllReferrals(ref.user.id, new Set(visited));
          });
          
          return totalCount;
        }
        
        const totalReferrals = countAllReferrals(partner.user.id);
        
        // Get direct referrals (level 1)
        const directReferrals = partnersWithInviters.filter(p => 
          p.inviter && p.inviter.id === partner.user.id
        );
        
        const hasChildren = directReferrals.length > 0;
        const expandId = `expand-${partner.id}`;
        const childrenId = `children-${partner.id}`;
        
        let node = `
          <div class="partner-node level-${level}" style="margin-left: ${level * 20}px;">
            <div class="partner-header" onclick="${hasChildren ? `toggleChildren('${expandId}', '${childrenId}')` : ''}" style="cursor: ${hasChildren ? 'pointer' : 'default'};">
              <span class="expand-icon" id="${expandId}" style="display: ${hasChildren ? 'inline-block' : 'none'};">▶</span>
              <span class="partner-info">
                <span class="level-emoji">${levelEmoji}</span>
                <span class="partner-name">${partnerName}${username}</span>
                <span class="balance">${balance} PZ</span>
                <span class="referrals">(${totalReferrals} рефералов всего)</span>
                ${directReferrals.length > 0 ? `<span class="direct-referrals" style="font-size: 11px; color: #666;">(${directReferrals.length} прямых)</span>` : ''}
              </span>
            </div>
            <div class="children" id="${childrenId}" style="display: none;">
        `;
        
        // Add child nodes recursively
        directReferrals.forEach(referral => {
          node += buildPartnerNode(referral, level + 1);
        });
        
        node += `
            </div>
          </div>
        `;
        
        return node;
      }

      let html = '';
      rootPartners.forEach(rootPartner => {
        html += buildPartnerNode(rootPartner);
      });

      return html;
    }

    const hierarchyHtml = buildInteractiveHierarchy();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Интерактивная иерархия партнёров</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 20px; }
          h2 { color: #333; margin-bottom: 20px; }
          .btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 5px; }
          .btn:hover { background: #0056b3; }
          
          .stats { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-around; text-align: center; }
          .stat-item h4 { margin: 0; color: #1976d2; }
          .stat-item p { margin: 5px 0 0 0; font-size: 18px; font-weight: bold; }
          
          .hierarchy-container { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; border: 1px solid #e9ecef; }
          
          .partner-node { margin: 5px 0; }
          .partner-header { padding: 10px; border-radius: 6px; transition: background-color 0.2s; }
          .partner-header:hover { background: #e9ecef; }
          
          .expand-icon { margin-right: 8px; font-size: 12px; transition: transform 0.2s; }
          .expand-icon.expanded { transform: rotate(90deg); }
          
          .partner-info { display: flex; align-items: center; gap: 10px; }
          .level-emoji { font-size: 16px; }
          .partner-name { font-weight: 600; color: #333; }
          .balance { color: #28a745; font-weight: bold; }
          .referrals { color: #6c757d; font-size: 14px; }
          
          .children { margin-left: 20px; border-left: 2px solid #dee2e6; padding-left: 15px; }
          
          .level-0 .partner-header { background: #fff3cd; border-left: 4px solid #ffc107; }
          .level-1 .partner-header { background: #d1ecf1; border-left: 4px solid #17a2b8; }
          .level-2 .partner-header { background: #f8d7da; border-left: 4px solid #dc3545; }
          .level-3 .partner-header { background: #e2e3e5; border-left: 4px solid #6c757d; }
          
          .controls { margin-bottom: 20px; }
          .control-btn { background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px; }
          .control-btn:hover { background: #5a6268; }
          .control-btn.primary { background: #007bff; }
          .control-btn.primary:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🌳 Интерактивная иерархия партнёров v3.0</h2>
          <p style="color: #666; font-size: 12px; margin: 5px 0;">Версия: 3.0 | ${new Date().toLocaleString()}</p>
          
          <div class="controls">
            <a href="/admin/partners" class="btn">← К партнёрам</a>
            <a href="/admin" class="btn">🏠 Главная</a>
            <button class="control-btn" onclick="expandAll()">🔽 Развернуть всё</button>
            <button class="control-btn" onclick="collapseAll()">🔼 Свернуть всё</button>
          </div>
          
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
          
          <div class="hierarchy-container">
            <h3>🌳 Дерево партнёрской иерархии:</h3>
            <div class="hierarchy-tree">
              ${hierarchyHtml || '<p style="text-align: center; color: #6c757d;">Партнёрская иерархия пуста</p>'}
            </div>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <h4 style="margin: 0 0 10px 0; color: #856404;">📋 Обозначения:</h4>
            <p style="margin: 0; color: #856404;">
              👑 Корневые партнёры (без пригласителя) - нажмите для раскрытия<br>
              🥈 Партнёры 1-го уровня<br>
              🥉 Партнёры 2-го уровня<br>
              📋 Партнёры 3-го уровня и ниже<br>
              ▶ Нажмите на стрелку для раскрытия/скрытия уровней
            </p>
          </div>
        </div>
        
        <script>
          function toggleChildren(expandId, childrenId) {
            const expandIcon = document.getElementById(expandId);
            const children = document.getElementById(childrenId);
            
            if (children.style.display === 'none') {
              children.style.display = 'block';
              expandIcon.classList.add('expanded');
            } else {
              children.style.display = 'none';
              expandIcon.classList.remove('expanded');
            }
          }
          
          function expandAll() {
            const allExpandIcons = document.querySelectorAll('.expand-icon');
            const allChildren = document.querySelectorAll('.children');
            
            allExpandIcons.forEach(icon => {
              icon.classList.add('expanded');
            });
            
            allChildren.forEach(children => {
              children.style.display = 'block';
            });
          }
          
          function collapseAll() {
            const allExpandIcons = document.querySelectorAll('.expand-icon');
            const allChildren = document.querySelectorAll('.children');
            
            allExpandIcons.forEach(icon => {
              icon.classList.remove('expanded');
            });
            
            allChildren.forEach(children => {
              children.style.display = 'none';
            });
          }
        </script>
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
          .product-actions .edit-btn { background: #e0e7ff; color: #1d4ed8; }
          .product-actions .edit-btn:hover { background: #c7d2fe; }
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
              <button type="button" class="edit-btn" onclick="openEditProductModal('${product.id}', '${product.title.replace(/'/g, "\'")}', '${product.summary ? product.summary.replace(/'/g, "\'") : ''}', '${product.description ? product.description.replace(/'/g, "\'") : ''}', ${product.price}, '${product.categoryId}', ${product.isActive ? 'true' : 'false'})">✏️ Редактировать</button>
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

// Update product
router.post('/products/:productId/update', requireAdmin, express.json(), async (req, res) => {
  try {
    const { productId } = req.params;
    const { title, price, summary, description, isActive } = req.body as any;
    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        title: typeof title === 'string' ? title.trim() : undefined,
        price: typeof price === 'number' ? price : undefined,
        summary: typeof summary === 'string' ? summary : undefined,
        description: typeof description === 'string' ? description : undefined,
        isActive: typeof isActive === 'boolean' ? isActive : undefined,
      },
    });
    res.json({ success: true, product });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, error: 'Ошибка обновления товара' });
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
              <div style="font-size: 12px; color: #666;">Баланс = Всего бонусов</div>
            </div>
          </div>
          
          <div class="stats">
            <div class="stat">💰 Баланс: ${Number(partner.balance).toFixed(2)} PZ</div>
            <div class="stat">🎁 Всего бонусов: ${Number(partner.bonus).toFixed(2)} PZ</div>
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

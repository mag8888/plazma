import express from 'express';
import { prisma } from '../lib/prisma.js';
import { recalculatePartnerBonuses } from '../services/partner-service.js';

const router = express.Router();

// Middleware to check admin access
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const session = req.session as any;
  if (!session.isAdmin) {
    return res.redirect('/admin/login');
  }
  next();
};

// Test endpoint to check if module is working
router.get('/orders-test', requireAdmin, async (req, res) => {
  res.json({ success: true, message: 'Orders module is working!' });
});

// Orders management page
router.get('/orders', requireAdmin, async (req, res) => {
  try {
    console.log('📦 Loading orders for admin panel...');
    
    const orders = await prisma.orderRequest.findMany({
      orderBy: [
        { status: 'asc' }, // NEW заказы сначала
        { createdAt: 'desc' }
      ],
      include: {
        user: { 
          select: { 
            firstName: true, 
            lastName: true, 
            username: true, 
            balance: true,
            partner: {
              select: { id: true }
            }
          } 
        }
      }
    });
    
    console.log(`📦 Found ${orders.length} orders in database`);

    // Group orders by status
    const ordersByStatus = {
      NEW: orders.filter(order => order.status === 'NEW'),
      PROCESSING: orders.filter(order => order.status === 'PROCESSING'),
      COMPLETED: orders.filter(order => order.status === 'COMPLETED'),
      CANCELLED: orders.filter(order => order.status === 'CANCELLED')
    };

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Управление заказами - Plazma Water Admin</title>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; padding: 20px; background: #f5f5f5; 
          }
          .container { 
            max-width: 1400px; margin: 0 auto; background: white; 
            border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
            overflow: hidden; 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; padding: 30px; text-align: center; 
          }
          .back-btn { 
            background: #6c757d; color: white; text-decoration: none; 
            padding: 10px 20px; border-radius: 6px; 
            display: inline-block; margin-bottom: 20px; 
          }
          .back-btn:hover { background: #5a6268; }
          .content { padding: 30px; }
          
          .status-section { margin-bottom: 30px; }
          .status-header { 
            font-size: 20px; font-weight: bold; margin-bottom: 15px; 
            padding: 10px 15px; border-radius: 8px; display: flex; 
            align-items: center; gap: 10px; 
          }
          .status-header.new { background: #f8d7da; color: #721c24; border-left: 4px solid #dc3545; }
          .status-header.processing { background: #fff3cd; color: #856404; border-left: 4px solid #ffc107; }
          .status-header.completed { background: #d4edda; color: #155724; border-left: 4px solid #28a745; }
          .status-header.cancelled { background: #e2e3e5; color: #383d41; border-left: 4px solid #6c757d; }
          
          .orders-grid { display: grid; gap: 15px; }
          .order-card { 
            background: #f8f9fa; border: 1px solid #dee2e6; 
            border-radius: 8px; padding: 20px; transition: all 0.2s ease; 
            cursor: pointer; 
          }
          .order-card:hover { 
            box-shadow: 0 4px 8px rgba(0,0,0,0.1); 
            transform: translateY(-2px); 
          }
          .order-card.new { 
            border-left: 4px solid #dc3545; 
            background: linear-gradient(135deg, #fff5f5 0%, #f8f9fa 100%); 
          }
          .order-card.processing { border-left: 4px solid #ffc107; }
          .order-card.completed { border-left: 4px solid #28a745; }
          .order-card.cancelled { border-left: 4px solid #6c757d; }
          
          .order-header { 
            display: flex; justify-content: space-between; 
            align-items: flex-start; margin-bottom: 15px; 
          }
          .order-info h4 { margin: 0; font-size: 18px; color: #212529; }
          .order-info p { margin: 5px 0 0 0; color: #6c757d; font-size: 14px; }
          .order-status { 
            padding: 4px 12px; border-radius: 12px; 
            font-size: 12px; font-weight: 600; 
          }
          .order-status.new { background: #dc3545; color: white; }
          .order-status.processing { background: #ffc107; color: #212529; }
          .order-status.completed { background: #28a745; color: white; }
          .order-status.cancelled { background: #6c757d; color: white; }
          
          .order-details { margin-bottom: 15px; }
          .order-items { margin-bottom: 10px; }
          .order-item { 
            display: flex; justify-content: space-between; 
            padding: 5px 0; border-bottom: 1px solid #e9ecef; 
          }
          .order-total { 
            font-weight: bold; font-size: 16px; 
            color: #28a745; text-align: right; 
          }
          
          .order-actions { 
            display: flex; gap: 10px; flex-wrap: wrap; 
          }
          .btn { 
            padding: 8px 16px; border: none; border-radius: 6px; 
            cursor: pointer; font-size: 12px; font-weight: 600; 
            transition: all 0.2s ease; 
          }
          .btn:hover { transform: translateY(-1px); }
          .btn-primary { background: #007bff; color: white; }
          .btn-success { background: #28a745; color: white; }
          .btn-warning { background: #ffc107; color: #212529; }
          .btn-danger { background: #dc3545; color: white; }
          .btn-secondary { background: #6c757d; color: white; }
          .btn:disabled { opacity: 0.5; cursor: not-allowed; }
          
          .user-balance { 
            background: #e8f5e8; padding: 8px 12px; 
            border-radius: 6px; margin-bottom: 10px; 
            font-weight: 600; color: #155724; 
          }
          .user-balance.insufficient { 
            background: #f8d7da; color: #721c24; 
          }
          
          .modal-overlay { 
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); 
            z-index: 1000; display: flex; align-items: center; justify-content: center; 
          }
          .modal-content { 
            background: white; border-radius: 12px; padding: 0; 
            max-width: 600px; width: 95%; max-height: 80vh; 
            overflow-y: auto; box-shadow: 0 25px 50px rgba(0,0,0,0.2); 
          }
          .modal-header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; padding: 20px; border-radius: 12px 12px 0 0; 
            display: flex; justify-content: space-between; align-items: center; 
          }
          .modal-body { padding: 20px; }
          .close-btn { 
            background: rgba(255,255,255,0.2); border: none; 
            color: white; font-size: 18px; cursor: pointer; 
            width: 30px; height: 30px; border-radius: 50%; 
          }
          .close-btn:hover { background: rgba(255,255,255,0.3); }
          
          .form-group { margin-bottom: 15px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: 600; }
          .form-group select { 
            width: 100%; padding: 8px 12px; border: 2px solid #e2e8f0; 
            border-radius: 6px; font-size: 14px; 
          }
          .form-actions { 
            display: flex; gap: 10px; justify-content: flex-end; 
            margin-top: 20px; 
          }
          
          .alert { 
            padding: 12px 16px; border-radius: 6px; margin-bottom: 15px; 
          }
          .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .alert-danger { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          .alert-info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Управление заказами</h1>
            <p>Полный контроль над заказами и их статусами</p>
          </div>
          
          <div class="content">
            <a href="/admin" class="back-btn">← Назад к админ-панели</a>
            
            <!-- New Orders -->
            ${ordersByStatus.NEW.length > 0 ? `
              <div class="status-section">
                <div class="status-header new">
                  🔴 Новые заказы (${ordersByStatus.NEW.length})
                </div>
                <div class="orders-grid">
                  ${ordersByStatus.NEW.map(order => createOrderCard(order)).join('')}
                </div>
              </div>
            ` : ''}
            
            <!-- Processing Orders -->
            ${ordersByStatus.PROCESSING.length > 0 ? `
              <div class="status-section">
                <div class="status-header processing">
                  🟡 Заказы в обработке (${ordersByStatus.PROCESSING.length})
                </div>
                <div class="orders-grid">
                  ${ordersByStatus.PROCESSING.map(order => createOrderCard(order)).join('')}
                </div>
              </div>
            ` : ''}
            
            <!-- Completed Orders -->
            ${ordersByStatus.COMPLETED.length > 0 ? `
              <div class="status-section">
                <div class="status-header completed">
                  🟢 Завершенные заказы (${ordersByStatus.COMPLETED.length})
                </div>
                <div class="orders-grid">
                  ${ordersByStatus.COMPLETED.map(order => createOrderCard(order)).join('')}
                </div>
              </div>
            ` : ''}
            
            <!-- Cancelled Orders -->
            ${ordersByStatus.CANCELLED.length > 0 ? `
              <div class="status-section">
                <div class="status-header cancelled">
                  ⚫ Отмененные заказы (${ordersByStatus.CANCELLED.length})
                </div>
                <div class="orders-grid">
                  ${ordersByStatus.CANCELLED.map(order => createOrderCard(order)).join('')}
                </div>
              </div>
            ` : ''}
            
            ${orders.length === 0 ? `
              <div style="text-align: center; padding: 40px; color: #6c757d;">
                <h3>📭 Нет заказов</h3>
                <p>Заказы появятся здесь после создания пользователями</p>
                <div style="margin-top: 20px;">
                  <a href="/admin" class="btn" style="background: #007bff; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px;">
                    ← Вернуться к админ-панели
                  </a>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
        
        <script>
          // Open order details modal
          function openOrderDetails(orderId) {
            fetch('/admin/orders/' + orderId)
              .then(response => response.text())
              .then(html => {
                document.body.insertAdjacentHTML('beforeend', html);
              })
              .catch(error => {
                alert('Ошибка загрузки деталей заказа: ' + error.message);
              });
          }
          
          // Close modal
          function closeModal() {
            const modal = document.querySelector('.modal-overlay');
            if (modal) {
              modal.remove();
            }
          }
          
          // Update order status
          function updateOrderStatus(orderId, newStatus) {
            if (!confirm('Изменить статус заказа на "' + getStatusName(newStatus) + '"?')) {
              return;
            }
            
            fetch('/admin/orders/' + orderId + '/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ status: newStatus })
            })
            .then(response => response.json())
            .then(result => {
              if (result.success) {
                alert('Статус заказа успешно обновлен!');
                location.reload();
              } else {
                alert('Ошибка: ' + result.error);
              }
            })
            .catch(error => {
              alert('Ошибка: ' + error.message);
            });
          }
          
          // Pay from balance
          function payFromBalance(orderId) {
            if (!confirm('Оплатить заказ с баланса пользователя?')) {
              return;
            }
            
            fetch('/admin/orders/' + orderId + '/pay', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include'
            })
            .then(response => response.json())
            .then(result => {
              if (result.success) {
                alert('Заказ успешно оплачен! Реферальные бонусы начислены.');
                location.reload();
              } else {
                alert('Ошибка: ' + result.error);
              }
            })
            .catch(error => {
              alert('Ошибка: ' + error.message);
            });
          }
          
          function getStatusName(status) {
            const names = {
              'NEW': 'Новый',
              'PROCESSING': 'В обработке',
              'COMPLETED': 'Готово',
              'CANCELLED': 'Отмена'
            };
            return names[status] || status;
          }
          
          // Close modal on overlay click
          document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal-overlay')) {
              closeModal();
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Orders page error:', error);
    res.status(500).send('Ошибка загрузки заказов');
  }
});

// Create order card HTML
function createOrderCard(order: any) {
  const items = JSON.parse(order.itemsJson || '[]');
  const totalAmount = items.reduce((sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1), 0);
  const userBalance = order.user?.balance || 0;
  const canPay = userBalance >= totalAmount && order.status === 'NEW';
  
  return `
    <div class="order-card ${order.status.toLowerCase()}" onclick="openOrderDetails('${order.id}')">
      <div class="order-header">
        <div class="order-info">
          <h4>Заказ #${order.id.slice(-8)}</h4>
          <p>${order.user?.firstName || 'Пользователь'} ${order.user?.lastName || ''} (@${order.user?.username || 'без username'})</p>
          <p>Дата: ${new Date(order.createdAt).toLocaleString('ru-RU')}</p>
        </div>
        <div class="order-status ${order.status.toLowerCase()}">
          ${getStatusDisplayName(order.status)}
        </div>
      </div>
      
      <div class="order-details">
        <div class="user-balance ${userBalance < totalAmount ? 'insufficient' : ''}">
          💰 Баланс пользователя: ${userBalance.toFixed(2)} PZ
        </div>
        
        <div class="order-items">
          ${items.map((item: any) => `
            <div class="order-item">
              <span>${item.title} x${item.quantity}</span>
              <span>${(item.price * item.quantity).toFixed(2)} PZ</span>
            </div>
          `).join('')}
        </div>
        
        <div class="order-total">
          Итого: ${totalAmount.toFixed(2)} PZ
        </div>
      </div>
      
      <div class="order-actions" onclick="event.stopPropagation()">
        ${order.status === 'NEW' ? `
          <button class="btn btn-warning" onclick="updateOrderStatus('${order.id}', 'PROCESSING')">
            🟡 В обработку
          </button>
          <button class="btn btn-success" onclick="updateOrderStatus('${order.id}', 'COMPLETED')">
            🟢 Готово
          </button>
          <button class="btn btn-danger" onclick="updateOrderStatus('${order.id}', 'CANCELLED')">
            ⚫ Отмена
          </button>
          ${canPay ? `
            <button class="btn btn-primary" onclick="payFromBalance('${order.id}')">
              💳 Оплатить с баланса
            </button>
          ` : `
            <button class="btn btn-secondary" disabled title="Недостаточно средств на балансе">
              💳 Оплатить с баланса
            </button>
          `}
        ` : ''}
        
        ${order.status === 'PROCESSING' ? `
          <button class="btn btn-success" onclick="updateOrderStatus('${order.id}', 'COMPLETED')">
            🟢 Готово
          </button>
          <button class="btn btn-danger" onclick="updateOrderStatus('${order.id}', 'CANCELLED')">
            ⚫ Отмена
          </button>
        ` : ''}
        
        ${order.status === 'COMPLETED' ? `
          <button class="btn btn-warning" onclick="updateOrderStatus('${order.id}', 'PROCESSING')">
            🟡 В обработку
          </button>
        ` : ''}
        
        ${order.status === 'CANCELLED' ? `
          <button class="btn btn-primary" onclick="updateOrderStatus('${order.id}', 'NEW')">
            🔴 Восстановить
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function getStatusDisplayName(status: string) {
  const names = {
    'NEW': '🔴 Новый',
    'PROCESSING': '🟡 В обработке',
    'COMPLETED': '🟢 Готово',
    'CANCELLED': '⚫ Отмена'
  };
  return names[status as keyof typeof names] || status;
}

// Get order details modal
router.get('/orders/:orderId', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await prisma.orderRequest.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            balance: true,
            partner: {
              select: { id: true }
            }
          }
        }
      }
    });
    
    if (!order) {
      return res.status(404).send('Заказ не найден');
    }
    
    const items = JSON.parse((order.itemsJson as string) || '[]');
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1), 0);
    
    res.send(`
      <div class="modal-overlay" onclick="closeModal()">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h2>📦 Детали заказа #${order.id.slice(-8)}</h2>
            <button class="close-btn" onclick="closeModal()">&times;</button>
          </div>
          
          <div class="modal-body">
            <div class="form-group">
              <label><strong>Пользователь:</strong></label>
              <p>${order.user?.firstName || 'Пользователь'} ${order.user?.lastName || ''} (@${order.user?.username || 'без username'})</p>
            </div>
            
            <div class="form-group">
              <label><strong>Баланс пользователя:</strong></label>
              <div class="user-balance ${(order.user?.balance || 0) < totalAmount ? 'insufficient' : ''}">
                💰 ${(order.user?.balance || 0).toFixed(2)} PZ
              </div>
            </div>
            
            <div class="form-group">
              <label><strong>Статус заказа:</strong></label>
              <div class="order-status ${order.status.toLowerCase()}">
                ${getStatusDisplayName(order.status)}
              </div>
            </div>
            
            <div class="form-group">
              <label><strong>Товары:</strong></label>
              <div class="order-items">
                ${items.map((item: any) => `
                  <div class="order-item">
                    <span><strong>${item.title}</strong> x${item.quantity}</span>
                    <span>${(item.price * item.quantity).toFixed(2)} PZ</span>
                  </div>
                `).join('')}
                <div class="order-total">
                  Итого: ${totalAmount.toFixed(2)} PZ
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label><strong>Дата создания:</strong></label>
              <p>${new Date(order.createdAt).toLocaleString('ru-RU')}</p>
            </div>
            
            <div class="form-actions">
              <button class="btn btn-secondary" onclick="closeModal()">Закрыть</button>
            </div>
          </div>
        </div>
      </div>
    `);
  } catch (error) {
    console.error('❌ Order details error:', error);
    res.status(500).send('Ошибка загрузки деталей заказа');
  }
});

// Update order status
router.post('/orders/:orderId/status', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    console.log(`📦 Updating order ${orderId} status to ${status}`);
    
    if (!['NEW', 'PROCESSING', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.json({ success: false, error: 'Неверный статус' });
    }
    
    const order = await prisma.orderRequest.update({
      where: { id: orderId },
      data: { status }
    });
    
    // Log the status change
    await prisma.userHistory.create({
      data: {
        userId: order.userId || '',
        action: 'order_status_changed',
        payload: {
          orderId: order.id,
          newStatus: status,
          oldStatus: order.status
        }
      }
    });
    
    console.log(`✅ Order ${orderId} status updated to ${status}`);
    
    res.json({ 
      success: true, 
      message: `Статус заказа изменен на "${getStatusDisplayName(status)}"`
    });
    
  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.json({ success: false, error: 'Ошибка обновления статуса заказа' });
  }
});

// Pay order from user balance
router.post('/orders/:orderId/pay', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log(`💳 Processing payment for order ${orderId}`);
    
    const order = await prisma.orderRequest.findUnique({
      where: { id: orderId },
      include: {
        user: {
          include: { partner: true }
        }
      }
    });
    
    if (!order) {
      return res.json({ success: false, error: 'Заказ не найден' });
    }
    
    if (order.status !== 'NEW') {
      return res.json({ success: false, error: 'Можно оплачивать только новые заказы' });
    }
    
    const items = JSON.parse((order.itemsJson as string) || '[]');
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1), 0);
    
    const userBalance = order.user?.balance || 0;
    if (userBalance < totalAmount) {
      return res.json({ success: false, error: 'Недостаточно средств на балансе пользователя' });
    }
    
    // Deduct amount from user balance
    const newBalance = userBalance - totalAmount;
    
    await prisma.user.update({
      where: { id: order.userId || '' },
      data: { balance: newBalance }
    });
    
    // Update partner profile balance if exists
    if (order.user?.partner) {
      await prisma.partnerProfile.update({
        where: { id: order.user.partner.id },
        data: { balance: newBalance }
      });
    }
    
    // Update order status to COMPLETED
    await prisma.orderRequest.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' }
    });
    
    // Calculate and distribute referral bonuses
    await distributeReferralBonuses(order.userId || '', totalAmount);
    
    // Log the payment
    await prisma.userHistory.create({
      data: {
        userId: order.userId || '',
        action: 'order_paid',
        payload: {
          orderId: order.id,
          amount: totalAmount,
          newBalance: newBalance,
          oldBalance: userBalance
        }
      }
    });
    
    console.log(`✅ Order ${orderId} paid successfully. Amount: ${totalAmount} PZ`);
    
    res.json({ 
      success: true, 
      message: `Заказ оплачен на ${totalAmount.toFixed(2)} PZ. Реферальные бонусы начислены.`
    });
    
  } catch (error) {
    console.error('❌ Pay order error:', error);
    res.json({ success: false, error: 'Ошибка оплаты заказа' });
  }
});

// Distribute referral bonuses
async function distributeReferralBonuses(userId: string, orderAmount: number) {
  try {
    console.log(`🎁 Distributing referral bonuses for user ${userId}, order amount: ${orderAmount} PZ`);
    
    // Find who invited this user
    const referralRecord = await prisma.partnerReferral.findFirst({
      where: { referredId: userId },
      include: {
        profile: {
          include: { user: true }
        }
      }
    });
    
    if (!referralRecord) {
      console.log(`ℹ️ No referral found for user ${userId}`);
      return;
    }
    
    const inviterProfile = referralRecord.profile;
    const bonusAmount = Math.round(orderAmount * 0.1 * 100) / 100; // 10% bonus
    
    console.log(`🎁 Calculating bonus: ${orderAmount} * 0.1 = ${bonusAmount} PZ for inviter ${inviterProfile.userId}`);
    
    // Add bonus to inviter's balance
    await prisma.partnerTransaction.create({
      data: {
        profileId: inviterProfile.id,
        type: 'CREDIT',
        amount: bonusAmount,
        description: `Реферальный бонус за заказ пользователя ${userId}`,
      }
    });
    
    // Recalculate inviter's total bonuses
    await recalculatePartnerBonuses(inviterProfile.id);
    
    // Log the bonus
    await prisma.userHistory.create({
      data: {
        userId: inviterProfile.userId,
        action: 'referral_bonus_received',
        payload: {
          amount: bonusAmount,
          fromUserId: userId,
          orderAmount: orderAmount
        }
      }
    });
    
    console.log(`✅ Referral bonus ${bonusAmount} PZ distributed to ${inviterProfile.userId}`);
    
  } catch (error) {
    console.error('❌ Referral bonus distribution error:', error);
  }
}

export { router as ordersModule };

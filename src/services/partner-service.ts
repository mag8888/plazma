import { PartnerProgramType, TransactionType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

function generateReferralCode() {
  return `PW${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function ensureReferralCode(): Promise<string> {
  // ensure uniqueness
  while (true) {
    const code = generateReferralCode();
    const exists = await prisma.partnerProfile.findFirst({ where: { referralCode: code } });
    if (!exists) {
      return code;
    }
  }
}

export async function getOrCreatePartnerProfile(userId: string, programType: PartnerProgramType = 'DIRECT') {
  const existing = await prisma.partnerProfile.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  const referralCode = await ensureReferralCode();
  return prisma.partnerProfile.create({
    data: {
      userId,
      programType,
      referralCode,
      isActive: false, // По умолчанию неактивен
    },
  });
}

export async function activatePartnerProfile(userId: string, activationType: 'PURCHASE' | 'ADMIN', months: number = 1) {
  const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new Error('Partner profile not found');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000); // Добавляем месяцы

  return prisma.partnerProfile.update({
    where: { userId },
    data: {
      isActive: true,
      activatedAt: now,
      expiresAt,
      activationType,
    },
  });
}

export async function checkPartnerActivation(userId: string): Promise<boolean> {
  const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
  if (!profile) return false;

  // Проверяем, активен ли профиль и не истек ли срок
  if (!profile.isActive) return false;
  
  if (profile.expiresAt && new Date() > profile.expiresAt) {
    // Автоматически деактивируем истекший профиль
    await prisma.partnerProfile.update({
      where: { userId },
      data: { isActive: false }
    });
    return false;
  }

  return true;
}

export function buildReferralLink(code: string, programType: 'DIRECT' | 'MULTI_LEVEL') {
  // Create Telegram bot link with referral parameter based on program type
  const prefix = programType === 'DIRECT' ? 'ref_direct' : 'ref_multi';
  return `https://t.me/iplazmabot?start=${prefix}_${code}`;
}

export async function getPartnerDashboard(userId: string) {
  const profile = await prisma.partnerProfile.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      referrals: true,
    },
  });

  if (!profile) return null;

  const partners = await prisma.partnerReferral.count({ where: { profileId: profile.id } });

  return {
    profile,
    stats: {
      partners,
      directPartners: await prisma.partnerReferral.count({ where: { profileId: profile.id, level: 1 } }),
      multiPartners: await prisma.partnerReferral.count({ where: { profileId: profile.id, level: 2 } }),
    },
  };
}

export async function getPartnerList(userId: string) {
  const profile = await prisma.partnerProfile.findUnique({
    where: { userId },
  });

  if (!profile) return null;

  // Get direct partners (level 1) - users who were referred by this partner
  const directReferrals = await prisma.partnerReferral.findMany({
    where: { 
      profileId: profile.id, 
      level: 1 
    },
    include: {
      profile: {
        include: {
          user: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Get multi-level partners (level 2 and 3) - users referred by direct partners
  const multiReferrals = await prisma.partnerReferral.findMany({
    where: { 
      profileId: profile.id, 
      level: { gt: 1 }
    },
    include: {
      profile: {
        include: {
          user: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Get actual users who were referred with their referral data
  const directPartnerData = directReferrals
    .filter(ref => ref.referredId)
    .map(ref => ({
      user: null as any, // Will be filled below
      level: ref.level,
      joinedAt: ref.createdAt
    }));

  const multiPartnerData = multiReferrals
    .filter(ref => ref.referredId)
    .map(ref => ({
      user: null as any, // Will be filled below
      level: ref.level,
      joinedAt: ref.createdAt
    }));

  // Get users for direct partners
  const directUserIds = directReferrals.map(ref => ref.referredId).filter(Boolean) as string[];
  const directUsers = await prisma.user.findMany({
    where: { id: { in: directUserIds } }
  });

  // Get users for multi-level partners
  const multiUserIds = multiReferrals.map(ref => ref.referredId).filter(Boolean) as string[];
  const multiUsers = await prisma.user.findMany({
    where: { id: { in: multiUserIds } }
  });

  // Combine user data with referral data, removing duplicates
  const directPartnersMap = new Map();
  directReferrals
    .filter(ref => ref.referredId)
    .forEach(ref => {
      const user = directUsers.find(u => u.id === ref.referredId);
      if (user && !directPartnersMap.has(user.id)) {
        directPartnersMap.set(user.id, {
          id: user.id,
          firstName: user.firstName || 'Пользователь',
          username: user.username,
          telegramId: user.telegramId,
          level: ref.level,
          joinedAt: ref.createdAt
        });
      }
    });

  const multiPartnersMap = new Map();
  multiReferrals
    .filter(ref => ref.referredId)
    .forEach(ref => {
      const user = multiUsers.find(u => u.id === ref.referredId);
      if (user && !multiPartnersMap.has(user.id)) {
        multiPartnersMap.set(user.id, {
          id: user.id,
          firstName: user.firstName || 'Пользователь',
          username: user.username,
          telegramId: user.telegramId,
          level: ref.level,
          joinedAt: ref.createdAt
        });
      }
    });

  const directPartners = Array.from(directPartnersMap.values());
  const multiPartners = Array.from(multiPartnersMap.values());

  return {
    directPartners,
    multiPartners
  };
}

export async function recordPartnerTransaction(profileId: string, amount: number, description: string, type: TransactionType = 'CREDIT') {
  // Create transaction
  const transaction = await prisma.partnerTransaction.create({
    data: {
      profileId,
      amount,
      description,
      type,
    },
  });

  // Recalculate total bonus and balance from all transactions
  await recalculatePartnerBonuses(profileId);

  return transaction;
}

export async function recalculatePartnerBonuses(profileId: string) {
  console.log(`🔄 Starting bonus recalculation for profile ${profileId}...`);
  
  const allTransactions = await prisma.partnerTransaction.findMany({
    where: { profileId }
  });
  
  console.log(`📊 Found ${allTransactions.length} transactions for profile ${profileId}`);
  
  const totalBonus = allTransactions.reduce((sum, tx) => {
    const amount = tx.type === 'CREDIT' ? tx.amount : -tx.amount;
    console.log(`  - Transaction: ${tx.type} ${tx.amount} PZ (${tx.description})`);
    return sum + amount;
  }, 0);

  console.log(`💰 Total calculated bonus: ${totalBonus} PZ`);

  // Update both balance and bonus fields in PartnerProfile
  const updatedProfile = await prisma.partnerProfile.update({
    where: { id: profileId },
    data: {
      balance: totalBonus,  // Balance = total bonuses
      bonus: totalBonus     // Bonus = total bonuses (for display)
    }
  });

  // Also update user balance in User table
  await prisma.user.update({
    where: { id: updatedProfile.userId },
    data: { balance: totalBonus }
  });

  console.log(`✅ Updated profile ${profileId}: balance = ${updatedProfile.balance} PZ, bonus = ${updatedProfile.bonus} PZ`);
  console.log(`✅ Updated user ${updatedProfile.userId}: balance = ${totalBonus} PZ`);
  return totalBonus;
}

// Новая функция для расчета бонусов по двойной системе
export async function calculateDualSystemBonuses(orderUserId: string, orderAmount: number) {
  console.log(`🎯 Calculating dual system bonuses for order ${orderAmount} PZ by user ${orderUserId}`);
  
  // Находим всех партнеров, которые могут получить бонусы
  const partnerReferrals = await prisma.partnerReferral.findMany({
    where: { referredId: orderUserId },
    include: {
      profile: {
        include: { user: true }
      }
    },
    orderBy: { level: 'asc' }
  });

  if (partnerReferrals.length === 0) {
    console.log(`❌ No partner referrals found for user ${orderUserId}`);
    return;
  }

  const bonuses = [];

  for (const referral of partnerReferrals) {
    const partnerProfile = referral.profile;
    
    // Проверяем, активен ли партнерский профиль
    const isActive = await checkPartnerActivation(partnerProfile.userId);
    if (!isActive) {
      console.log(`⚠️ Partner ${partnerProfile.userId} is not active, skipping bonus`);
      continue;
    }

    let bonusAmount = 0;
    let description = '';

    if (referral.level === 1) {
      // Прямой реферал: 25% + 15% = 40%
      bonusAmount = orderAmount * 0.40;
      description = `Бонус за заказ прямого реферала (${orderAmount} PZ) - двойная система`;
    } else if (referral.level === 2) {
      // Уровень 2: 5%
      bonusAmount = orderAmount * 0.05;
      description = `Бонус за заказ реферала 2-го уровня (${orderAmount} PZ)`;
    } else if (referral.level === 3) {
      // Уровень 3: 5%
      bonusAmount = orderAmount * 0.05;
      description = `Бонус за заказ реферала 3-го уровня (${orderAmount} PZ)`;
    }

    if (bonusAmount > 0) {
      // Добавляем бонус партнеру
      await recordPartnerTransaction(
        partnerProfile.id,
        bonusAmount,
        description,
        'CREDIT'
      );

      // Добавляем запись в историю пользователя
      await prisma.userHistory.create({
        data: {
          userId: partnerProfile.userId,
          action: 'REFERRAL_BONUS',
          payload: {
            amount: bonusAmount,
            orderAmount,
            level: referral.level,
            referredUserId: orderUserId,
            type: 'DUAL_SYSTEM'
          }
        }
      });

      bonuses.push({
        partnerId: partnerProfile.userId,
        partnerName: partnerProfile.user.firstName || 'Партнер',
        level: referral.level,
        amount: bonusAmount,
        description
      });

      console.log(`✅ Added ${bonusAmount} PZ bonus to partner ${partnerProfile.userId} (level ${referral.level})`);
    }
  }

  console.log(`🎉 Total bonuses distributed: ${bonuses.length} partners, ${bonuses.reduce((sum, b) => sum + b.amount, 0)} PZ`);
  return bonuses;
}

export async function createPartnerReferral(profileId: string, level: number, referredId?: string, contact?: string) {
  return prisma.partnerReferral.create({
    data: {
      profileId,
      level,
      referredId,
      contact,
    },
  });
}

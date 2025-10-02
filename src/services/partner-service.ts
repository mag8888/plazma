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

export async function getOrCreatePartnerProfile(userId: string, programType: PartnerProgramType) {
  const existing = await prisma.partnerProfile.findUnique({ where: { userId } });
  if (existing) {
    if (existing.programType !== programType) {
      return prisma.partnerProfile.update({ where: { id: existing.id }, data: { programType } });
    }
    return existing;
  }

  const referralCode = await ensureReferralCode();
  return prisma.partnerProfile.create({
    data: {
      userId,
      programType,
      referralCode,
    },
  });
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

  // Combine user data with referral data
  const directPartners = directReferrals
    .filter(ref => ref.referredId)
    .map(ref => {
      const user = directUsers.find(u => u.id === ref.referredId);
      if (!user) return null;
      return {
        id: user.id,
        firstName: user.firstName || 'Пользователь',
        username: user.username,
        telegramId: user.telegramId,
        level: ref.level,
        joinedAt: ref.createdAt
      };
    })
    .filter((partner): partner is NonNullable<typeof partner> => partner !== null);

  const multiPartners = multiReferrals
    .filter(ref => ref.referredId)
    .map(ref => {
      const user = multiUsers.find(u => u.id === ref.referredId);
      if (!user) return null;
      return {
        id: user.id,
        firstName: user.firstName || 'Пользователь',
        username: user.username,
        telegramId: user.telegramId,
        level: ref.level,
        joinedAt: ref.createdAt
      };
    })
    .filter((partner): partner is NonNullable<typeof partner> => partner !== null);

  return {
    directPartners,
    multiPartners
  };
}

export async function recordPartnerTransaction(profileId: string, amount: number, description: string, type: TransactionType = 'CREDIT') {
  return prisma.partnerTransaction.create({
    data: {
      profileId,
      amount,
      description,
      type,
    },
  });
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

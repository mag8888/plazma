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
      balance: 0,
      bonus: 0,
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

export async function recordPartnerTransaction(profileId: string, amount: number, description: string, type: TransactionType = 'CREDIT') {
  console.log('💰 Transaction: Starting recordPartnerTransaction');
  console.log('💰 Transaction: profileId:', profileId);
  console.log('💰 Transaction: amount:', amount);
  console.log('💰 Transaction: description:', description);
  console.log('💰 Transaction: type:', type);

  // First, create the transaction record
  const transaction = await prisma.partnerTransaction.create({
    data: {
      profileId,
      amount,
      description,
      type,
    },
  });
  console.log('💰 Transaction: Transaction record created:', transaction.id);

  // Get current balance before update
  const currentProfile = await prisma.partnerProfile.findUnique({
    where: { id: profileId },
    select: { balance: true }
  });
  console.log('💰 Transaction: Current balance:', currentProfile?.balance);

  // Then, update the partner's balance
  const balanceUpdate = type === 'CREDIT' ? amount : -amount;
  console.log('💰 Transaction: Balance update amount:', balanceUpdate);
  
  const updatedProfile = await prisma.partnerProfile.update({
    where: { id: profileId },
    data: {
      balance: {
        increment: balanceUpdate
      }
    }
  });
  console.log('💰 Transaction: New balance after update:', updatedProfile.balance);

  return transaction;
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

import { PartnerProgramType, Prisma, TransactionType } from '@prisma/client';
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

export function buildReferralLink(code: string) {
  const base = env.publicBaseUrl.replace(/\/$/, '');
  return `${base}/?ref=${code}`;
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
    },
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

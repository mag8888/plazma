import { prisma } from '../src/lib/prisma.js';

async function cleanupDuplicates() {
  console.log('🧹 Starting cleanup of duplicate data...');
  
  try {
    // Find all partner profiles
    const profiles = await prisma.partnerProfile.findMany({
      include: {
        referrals: true,
        transactions: true
      }
    });
    
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
          referrals.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          
          // Keep the first one, delete the rest
          const toDelete = referrals.slice(1);
          for (const duplicate of toDelete) {
            await prisma.partnerReferral.delete({
              where: { id: duplicate.id }
            });
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
          transactions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          
          // Keep the first one, delete the rest
          const toDelete = transactions.slice(1);
          for (const duplicate of toDelete) {
            await prisma.partnerTransaction.delete({
              where: { id: duplicate.id }
            });
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
    
    console.log('\n🎉 Cleanup completed!');
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}

cleanupDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

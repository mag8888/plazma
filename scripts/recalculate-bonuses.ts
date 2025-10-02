import { prisma } from '../src/lib/prisma.js';

async function recalculateBonuses() {
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
}

recalculateBonuses()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

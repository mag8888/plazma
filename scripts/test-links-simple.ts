import { buildReferralLink } from '../src/services/partner-service.js';

function testReferralLinks() {
  console.log('🧪 Testing referral links generation...\n');
  
  // Test with sample referral codes
  const testCodes = ['TEST123', 'ABC456', 'XYZ789'];
  
  for (const code of testCodes) {
    console.log(`📝 Testing with code: ${code}\n`);
    
    // Generate both types of links
    const directLink = buildReferralLink(code, 'DIRECT');
    const multiLink = buildReferralLink(code, 'MULTI_LEVEL');
    
    console.log(`   🔗 Direct Link (25%): ${directLink}`);
    console.log(`   🔗 Multi Link (15%+5%+5%): ${multiLink}`);
    
    // Check if links are different
    if (directLink === multiLink) {
      console.log(`   ⚠️  WARNING: Both links are identical!`);
    } else {
      console.log(`   ✅ Links are different as expected`);
    }
    
    // Parse the links to verify structure
    const directPayload = directLink.split('?start=')[1];
    const multiPayload = multiLink.split('?start=')[1];
    
    console.log(`   📝 Direct payload: ${directPayload}`);
    console.log(`   📝 Multi payload: ${multiPayload}`);
    
    // Verify payload structure
    if (directPayload.startsWith('ref_direct_') && multiPayload.startsWith('ref_multi_')) {
      console.log(`   ✅ Payload structure is correct`);
    } else {
      console.log(`   ❌ Payload structure is incorrect!`);
    }
    
    console.log('');
  }
  
  // Test link parsing logic
  console.log('🔍 Testing link parsing logic...\n');
  
  const testLinks = [
    'https://t.me/iplazmabot?start=ref_direct_TEST123',
    'https://t.me/iplazmabot?start=ref_multi_TEST123',
    'https://t.me/iplazmabot?start=ref_direct_ABC456',
    'https://t.me/iplazmabot?start=ref_multi_XYZ789'
  ];
  
  for (const link of testLinks) {
    const payload = link.split('?start=')[1];
    console.log(`Link: ${link}`);
    console.log(`Payload: ${payload}`);
    
    if (payload.startsWith('ref_direct_')) {
      const parts = payload.split('_');
      const programType = parts[1] === 'direct' ? 'DIRECT' : 'MULTI_LEVEL';
      const referralCode = parts.slice(2).join('_');
      console.log(`Parsed - Program: ${programType}, Code: ${referralCode}`);
    } else if (payload.startsWith('ref_multi_')) {
      const parts = payload.split('_');
      const programType = parts[1] === 'direct' ? 'DIRECT' : 'MULTI_LEVEL';
      const referralCode = parts.slice(2).join('_');
      console.log(`Parsed - Program: ${programType}, Code: ${referralCode}`);
    }
    console.log('');
  }
  
  console.log('✅ Referral links test completed!');
}

testReferralLinks();

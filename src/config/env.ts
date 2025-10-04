import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

export const env = {
  botToken: requireEnv('BOT_TOKEN'),
  botWebhookUrl: process.env.BOT_WEBHOOK_URL,
  botWebhookSecret: process.env.BOT_WEBHOOK_SECRET,
  adminChatId: process.env.ADMIN_CHAT_ID,
  databaseUrl: requireEnv('DATABASE_URL'),
  adminEmail: requireEnv('ADMIN_EMAIL'),
  adminPassword: requireEnv('ADMIN_PASSWORD'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
};

// Helper function to get all admin chat IDs
export function getAdminChatIds(): string[] {
  if (!env.adminChatId) return [];
  return env.adminChatId.split(',').map(id => id.trim()).filter(id => id);
}

// Helper function to send message to all admins
export async function sendToAllAdmins(bot: any, message: string): Promise<void> {
  const adminIds = getAdminChatIds();
  
  for (const chatId of adminIds) {
    try {
      await bot.telegram.sendMessage(chatId, message);
      console.log(`Message sent to admin: ${chatId}`);
    } catch (error) {
      console.error(`Failed to send message to admin ${chatId}:`, error);
    }
  }
}

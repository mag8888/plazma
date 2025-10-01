// Ensure production mode for AdminJS
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import express from 'express';
import { session, Telegraf } from 'telegraf';
import { env } from './config/env.js';
import { Context, SessionData } from './bot/context.js';
import { applyBotModules } from './bot/setup-modules.js';
import { prisma } from './lib/prisma.js';
import { ensureInitialData } from './lib/bootstrap.js';
import { setupAdminPanel } from './admin/index.js';
import { adminWebRouter } from './admin/web.js';

async function bootstrap() {
  await prisma.$connect();
  await ensureInitialData();

  const bot = new Telegraf<Context>(env.botToken, {
    handlerTimeout: 30_000,
  });

  bot.use(session<SessionData, Context>({ defaultSession: (): SessionData => ({}) }));
  await applyBotModules(bot);

  const app = express();
  app.use(express.json());

  // Web admin panel
  app.use('/admin', adminWebRouter);

  // await setupAdminPanel(app); // Disabled for MongoDB compatibility

  // Force long polling for now to ensure bot works
  console.log('Starting bot in long polling mode...');
  
  // Wait a bit to avoid conflicts
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Start web server first, then try to launch bot
  const port = Number(process.env.PORT ?? 3000);
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  // Retry bot launch with error handling (non-blocking)
  let retries = 3;
  const launchBot = async () => {
    while (retries > 0) {
      try {
        await bot.launch();
        console.log('Bot launched in long polling mode');
        break;
      } catch (error) {
        console.warn(`Bot launch failed, retries left: ${retries - 1}`, error);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        } else {
          console.error('Failed to launch bot after all retries - web server still running');
          // Don't throw error - let web server continue running
        }
      }
    }
  };

  // Launch bot asynchronously without blocking web server
  launchBot().catch(console.error);

  process.once('SIGINT', () => {
    void bot.stop('SIGINT');
  });

  process.once('SIGTERM', () => {
    void bot.stop('SIGTERM');
  });
}

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});

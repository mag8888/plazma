import type { Context as TelegrafContext } from 'telegraf';

export interface SessionData {
  currentCategoryId?: number | null;
  lastProductId?: number | null;
}

export interface Context extends TelegrafContext {
  session: SessionData;
}

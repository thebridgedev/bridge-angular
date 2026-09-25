import * as path from 'path';
import { type Browser, type BrowserContext, type Page } from '@playwright/test';

// Written by global-setup: the demo origin's `bridge:appId` and nothing else —
// no auth tokens. Without it a fresh context boots the demo with no app id at
// all, since the id is no longer baked into the environment file (TBP-721).
const BASE_STATE_PATH = path.resolve(__dirname, '../.auth/base-state.json');

/**
 * Creates a fresh browser context with no auth state but with the E2E app ID.
 */
export async function createCleanContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  cleanup: () => Promise<void>;
}> {
  const context = await browser.newContext({
    storageState: BASE_STATE_PATH,
  });

  const page = await context.newPage();

  return {
    context,
    page,
    cleanup: async () => {
      await page.close();
      await context.close();
    },
  };
}

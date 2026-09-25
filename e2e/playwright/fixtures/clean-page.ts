import { type Browser, type BrowserContext, type Page } from '@playwright/test';
import { currentWorkerApp } from './worker-app';

/**
 * Creates a fresh browser context with no auth state but with the E2E app ID.
 *
 * The app id is this WORKER's app (written by global-setup as that worker's
 * storage state), not a suite-wide one: a context built here has to boot the
 * demo against the same app the rest of the worker's test is talking to, or
 * the test would read one app's settings while the fixtures wrote another's.
 * Without any seeded state the demo would boot with no app id at all, since
 * the id is not baked into the environment file (TBP-721).
 */
export async function createCleanContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  cleanup: () => Promise<void>;
}> {
  const context = await browser.newContext({
    storageState: currentWorkerApp().storageStatePath,
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

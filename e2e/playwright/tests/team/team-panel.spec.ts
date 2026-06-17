/**
 * Team Panel Tests
 *
 * Verifies the <bridge-team-panel> component on /team-panel:
 * - Route protection (auth required)
 * - Tab navigation (Users, Profile, Workspace) via the custom .my-tab tab bar
 * - Users tab: list, add member, actions menu, edit, reset password, delete
 * - Profile tab: view and edit
 * - Workspace tab: view and edit
 *
 * Ported near-verbatim from bridge-react's `team/team-panel.spec.ts` — the
 * selectors (`.my-tab`, `data-bridge-team-*`, `#bridge-*` ids) are identical
 * because the Angular demo + components mirror the react markup.
 *
 * Email pattern for added members: iman+playwright-test-team-*@nebulr.group
 */

import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT, SHORT_TIMEOUT } from '../../fixtures/timeouts';
import { createCleanContext } from '../../fixtures/clean-page';

function testEmail(): string {
  return `iman+playwright-test-team-${Date.now()}@nebulr.group`;
}

async function goToTeamPanel(page: import('@playwright/test').Page) {
  await page.goto('/team-panel');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-bridge-team-panel]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
}

async function waitForLoaded(page: import('@playwright/test').Page) {
  await expect(page.locator('.bridge-team-loading')).not.toBeVisible({ timeout: LONG_TIMEOUT });
}

// ── Page Access ──────────────────────────────────────────────────────────────

test('/team-panel redirects to login when not authenticated', async ({ browser }) => {
  const { page, cleanup } = await createCleanContext(browser);

  try {
    await page.goto('/team-panel');
    await page.waitForURL(
      (url) => url.toString().includes('/auth/') || url.toString().includes('/login'),
      { timeout: LONG_TIMEOUT },
    );
    const url = page.url();
    expect(url.includes('/auth/') || url.includes('/login')).toBeTruthy();
  } finally {
    await cleanup();
  }
});

// ── Tab Navigation ───────────────────────────────────────────────────────────

test.describe('Tab Navigation', () => {
  test('renders the panel with Users, Profile, and Workspace tabs', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await expect(page.locator('button.my-tab:has-text("Users")')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('button.my-tab:has-text("Profile")')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('button.my-tab:has-text("Workspace")')).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('clicking tabs switches the visible content section', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await expect(page.locator('[data-bridge-team-users]')).toBeVisible({ timeout: MED_TIMEOUT });

    await page.locator('button.my-tab:has-text("Profile")').click();
    await expect(page.locator('[data-bridge-team-profile]')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('[data-bridge-team-users]')).not.toBeVisible();

    await page.locator('button.my-tab:has-text("Workspace")').click();
    await expect(page.locator('[data-bridge-team-workspace]')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('[data-bridge-team-profile]')).not.toBeVisible();

    await page.locator('button.my-tab:has-text("Users")').click();
    await expect(page.locator('[data-bridge-team-users]')).toBeVisible({ timeout: MED_TIMEOUT });
  });
});

// ── Users Tab ────────────────────────────────────────────────────────────────

test.describe('Users Tab', () => {
  test('shows the team members table with at least the owner', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await page.locator('[data-bridge-team-users]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    const table = page.locator('.bridge-team-table');
    await expect(table).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('"Add Member" button opens the add user dialog', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await page.locator('[data-bridge-team-users]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    await page.getByRole('button', { name: 'Add Member', exact: true }).click();

    const emailTextarea = page.locator('#bridge-add-emails');
    await expect(emailTextarea).toBeVisible({ timeout: MED_TIMEOUT });

    await page.locator('[data-bridge-team-dialog]:has(#bridge-add-emails) button:has-text("Cancel")').click();
    await expect(emailTextarea).not.toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('can add a new team member and they appear in the user table', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const email = testEmail();

    await goToTeamPanel(page);
    await page.locator('[data-bridge-team-users]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    await page.getByRole('button', { name: 'Add Member', exact: true }).click();
    await page.locator('#bridge-add-emails').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await page.locator('#bridge-add-emails').fill(email);
    await page.locator('[data-bridge-team-dialog] button:has-text("Add Members")').click();

    await expect(page.locator('#bridge-add-emails')).not.toBeVisible({ timeout: LONG_TIMEOUT });
    const userEmail = page.locator(`.bridge-team-user-email:has-text("${email}")`);
    await expect(userEmail).toBeVisible({ timeout: LONG_TIMEOUT });

    const userRow = page.locator('tr', {
      has: page.locator(`.bridge-team-user-email:has-text("${email}")`),
    });
    await userRow.locator('.bridge-team-actions-trigger').click();
    await page.locator('.bridge-team-actions-item--danger:has-text("Delete")').click();

    const deleteDialog = page.locator('[data-bridge-team-dialog][data-variant="danger"]');
    await deleteDialog.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await deleteDialog.locator('button:has-text("Delete")').click();

    await expect(userEmail).not.toBeVisible({ timeout: LONG_TIMEOUT });
  });

  test('user row actions menu shows Edit, Reset Password, and Delete options', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await page.locator('[data-bridge-team-users]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    const firstRow = page.locator('.bridge-team-table tbody tr').first();
    await firstRow.locator('.bridge-team-actions-trigger').click();

    const menu = page.locator('.bridge-team-actions-menu');
    await expect(menu).toBeVisible({ timeout: SHORT_TIMEOUT });
    await expect(page.locator('.bridge-team-actions-item:has-text("Edit")')).toBeVisible({ timeout: SHORT_TIMEOUT });
    await expect(page.locator('.bridge-team-actions-item:has-text("Reset Password")')).toBeVisible({ timeout: SHORT_TIMEOUT });
    await expect(page.locator('.bridge-team-actions-item--danger:has-text("Delete")')).toBeVisible({ timeout: SHORT_TIMEOUT });
  });

  test('edit dialog opens with role selector and enabled checkbox', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const email = testEmail();

    await goToTeamPanel(page);
    await page.locator('[data-bridge-team-users]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    await page.getByRole('button', { name: 'Add Member', exact: true }).click();
    await page.locator('#bridge-add-emails').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await page.locator('#bridge-add-emails').fill(email);
    await page.locator('[data-bridge-team-dialog] button:has-text("Add Members")').click();
    await expect(page.locator(`.bridge-team-user-email:has-text("${email}")`)).toBeVisible({ timeout: LONG_TIMEOUT });

    const userRow = page.locator('tr', {
      has: page.locator(`.bridge-team-user-email:has-text("${email}")`),
    });
    await userRow.locator('.bridge-team-actions-trigger').click();
    await page.locator('.bridge-team-actions-item:has-text("Edit")').click();

    const roleSelect = page.locator('#bridge-edit-role');
    await expect(roleSelect).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('[data-bridge-team-dialog]:has(#bridge-edit-role) input[type="checkbox"]')).toBeVisible({ timeout: SHORT_TIMEOUT });

    await page.locator('[data-bridge-team-dialog]:has(#bridge-edit-role) button:has-text("Cancel")').click();
    await expect(roleSelect).not.toBeVisible({ timeout: MED_TIMEOUT });

    const userEmail = page.locator(`.bridge-team-user-email:has-text("${email}")`);
    await userRow.locator('.bridge-team-actions-trigger').click();
    await page.locator('.bridge-team-actions-item--danger:has-text("Delete")').click();
    const deleteDialog = page.locator('[data-bridge-team-dialog][data-variant="danger"]');
    await deleteDialog.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await deleteDialog.locator('button:has-text("Delete")').click();
    await expect(userEmail).not.toBeVisible({ timeout: LONG_TIMEOUT });
  });

  test('reset password dialog opens with confirmation prompt', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    const email = testEmail();

    await goToTeamPanel(page);
    await page.locator('[data-bridge-team-users]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    await page.getByRole('button', { name: 'Add Member', exact: true }).click();
    await page.locator('#bridge-add-emails').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await page.locator('#bridge-add-emails').fill(email);
    await page.locator('[data-bridge-team-dialog] button:has-text("Add Members")').click();
    await expect(page.locator(`.bridge-team-user-email:has-text("${email}")`)).toBeVisible({ timeout: LONG_TIMEOUT });

    const userRow = page.locator('tr', {
      has: page.locator(`.bridge-team-user-email:has-text("${email}")`),
    });
    await userRow.locator('.bridge-team-actions-trigger').click();
    await page.locator('.bridge-team-actions-item:has-text("Reset Password")').click();

    const resetDialog = page.locator('[data-bridge-team-dialog][data-variant="default"]');
    await expect(resetDialog).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(resetDialog.locator('button:has-text("Send Reset Link")')).toBeVisible({ timeout: SHORT_TIMEOUT });

    await resetDialog.locator('button:has-text("Cancel")').click();
    await expect(resetDialog).not.toBeVisible({ timeout: MED_TIMEOUT });

    const userEmail = page.locator(`.bridge-team-user-email:has-text("${email}")`);
    await userRow.locator('.bridge-team-actions-trigger').click();
    await page.locator('.bridge-team-actions-item--danger:has-text("Delete")').click();
    const deleteDialog = page.locator('[data-bridge-team-dialog][data-variant="danger"]');
    await deleteDialog.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await deleteDialog.locator('button:has-text("Delete")').click();
    await expect(userEmail).not.toBeVisible({ timeout: LONG_TIMEOUT });
  });
});

// ── Profile Tab ──────────────────────────────────────────────────────────────

test.describe('Profile Tab', () => {
  test("shows current user's email as read-only and editable name fields", async ({
    authenticatedPage,
    testUser,
  }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await page.locator('button.my-tab:has-text("Profile")').click();
    await page.locator('[data-bridge-team-profile]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    const emailInput = page.locator('#bridge-profile-email');
    await expect(emailInput).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(emailInput).toBeDisabled();
    await expect(emailInput).toHaveValue(testUser.email);

    await expect(page.locator('#bridge-profile-first-name')).toBeVisible({ timeout: SHORT_TIMEOUT });
    await expect(page.locator('#bridge-profile-last-name')).toBeVisible({ timeout: SHORT_TIMEOUT });
    await expect(
      page.locator('[data-bridge-team-profile] button:has-text("Save Changes")'),
    ).toBeVisible({ timeout: SHORT_TIMEOUT });
  });

  test('can update first and last name and shows success alert', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await page.locator('button.my-tab:has-text("Profile")').click();
    await page.locator('[data-bridge-team-profile]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    await page.locator('#bridge-profile-first-name').fill('Test');
    await page.locator('#bridge-profile-last-name').fill('User');
    await page.locator('[data-bridge-team-profile] button:has-text("Save Changes")').click();

    await expect(
      page.locator('[data-bridge-team-profile] [data-bridge-alert][data-variant="success"]'),
    ).toBeVisible({ timeout: LONG_TIMEOUT });
  });
});

// ── Workspace Tab ─────────────────────────────────────────────────────────────

test.describe('Workspace Tab', () => {
  test('shows workspace name, locale fields, and Save Changes button', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await page.locator('button.my-tab:has-text("Workspace")').click();
    await page.locator('[data-bridge-team-workspace]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    await expect(page.locator('#bridge-workspace-name')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('#bridge-workspace-locale')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(
      page.locator('[data-bridge-team-workspace] button:has-text("Save Changes")'),
    ).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('can update workspace name and shows success alert', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await goToTeamPanel(page);

    await page.locator('button.my-tab:has-text("Workspace")').click();
    await page.locator('[data-bridge-team-workspace]').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await waitForLoaded(page);

    const nameInput = page.locator('#bridge-workspace-name');
    const originalName = await nameInput.inputValue();

    await nameInput.fill(`${originalName} (e2e)`);
    await page.locator('[data-bridge-team-workspace] button:has-text("Save Changes")').click();

    await expect(
      page.locator('[data-bridge-team-workspace] [data-bridge-alert][data-variant="success"]'),
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    await nameInput.fill(originalName);
    await page.locator('[data-bridge-team-workspace] button:has-text("Save Changes")').click();
  });
});

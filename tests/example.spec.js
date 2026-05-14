// @ts-check
import { test, expect } from '@playwright/test';

test('renders the desktop app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/OpenOmniClaw/);
  await expect(page.getByRole('heading', { name: 'OpenOmniClaw' })).toBeVisible();
  await expect(page.getByRole('link', { name: '对话' })).toBeVisible();
});

test('can navigate to skeleton feature pages', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Skills' }).click();
  await expect(page.getByRole('heading', { name: 'Skill 管理' })).toBeVisible();

  await page.getByRole('link', { name: '定时' }).click();
  await expect(page.getByRole('heading', { name: '定时任务' })).toBeVisible();
});

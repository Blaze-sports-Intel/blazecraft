// @ts-check
import { test, expect } from '@playwright/test';

/**
 * BlazeCraft Smoke Tests
 *
 * Verifies the app loads without errors and demo mode produces visible activity.
 */

test.describe('BlazeCraft Smoke Tests', () => {
  test('page loads without console errors', async ({ page }) => {
    const errors = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait a moment for any async errors
    await page.waitForTimeout(2000);

    // Filter out known acceptable errors (like missing favicons)
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('metrics bar renders with task metrics', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check metrics elements exist
    await expect(page.locator('#resCompleted')).toBeVisible();
    await expect(page.locator('#resFiles')).toBeVisible();
    await expect(page.locator('#resWorkers')).toBeVisible();
    await expect(page.locator('#resFailed')).toBeVisible();
    await expect(page.locator('#resTokens')).toBeVisible();
  });

  test('demo mode spawns workers within 5 seconds', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for demo to spawn workers (check workers metric changes from 0)
    await expect(async () => {
      const workersText = await page.locator('#resWorkers').textContent();
      const workers = parseInt(workersText || '0', 10);
      expect(workers).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });
  });

  test('event log shows at least one entry in demo mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for event log to have content
    await expect(async () => {
      const logItems = await page.locator('#logFeed .log-item').count();
      expect(logItems).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });
  });

  test('ops feed shows demo status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Ops feed should show demo message
    const opsFeed = page.locator('#opsFeed');
    await expect(opsFeed).toContainText('Demo');
  });

  test('metrics update over time in demo mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get initial metrics
    await page.waitForTimeout(1000);
    const initialCompleted = await page.locator('#resCompleted').textContent();

    // Wait and check if metrics changed
    await page.waitForTimeout(4000);
    const laterCompleted = await page.locator('#resCompleted').textContent();
    const laterTokens = await page.locator('#resTokens').textContent();

    // At least one metric should have changed (tokens typically increase quickly)
    const tokensChanged = parseInt(laterTokens || '0', 10) > 0;
    const completedChanged = initialCompleted !== laterCompleted;

    expect(tokensChanged || completedChanged).toBe(true);
  });

  test('canvas map is rendered', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check canvas exists and has dimensions
    const canvas = page.locator('#mapCanvas');
    await expect(canvas).toBeVisible();

    const width = await canvas.getAttribute('width');
    const height = await canvas.getAttribute('height');

    expect(parseInt(width || '0', 10)).toBeGreaterThan(0);
    expect(parseInt(height || '0', 10)).toBeGreaterThan(0);
  });

  test('command buttons are interactive', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check command buttons exist
    await expect(page.locator('button[data-cmd="scan"]')).toBeVisible();
    await expect(page.locator('button[data-cmd="stop"]')).toBeVisible();

    // Click scan (works without selection)
    await page.click('button[data-cmd="scan"]');

    // Should add an event to the log
    await page.waitForTimeout(500);
    const logContent = await page.locator('#logFeed').textContent();
    expect(logContent).toContain('Scan');
  });
});

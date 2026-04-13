import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/test/reset');
  expect(response.ok()).toBeTruthy();
});

test.describe('Hermes integration (E2E)', () => {
  test('incoming Hermes task appears and can be accepted', async ({ page, request }) => {
    // Start on the main page
    await page.goto('/');
    // Post a hermes assignment via server API
    const payload = {
      taskId: 'hermes-e2e-1',
      title: 'Hermes E2E Task',
      instructions: 'Please count bottles on shelf B',
      etaMinutes: 10,
      targetAgent: 'Nova',
    };
    const res = await request.post('/api/hermes/assign', { data: payload });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Wait for the client to poll and render the incoming task (allow longer for polling)
    await page.waitForSelector('#hermesPanel', { state: 'visible' });
    const taskLocator = page.locator(`#hermesPanel .hermes-task[data-id="${payload.taskId}"]`);
    await expect(taskLocator).toBeVisible({ timeout: 15000 });

    // Click Accept and verify a task card is created
    await taskLocator.locator('button', { hasText: 'Accept' }).click();

    // The active task list should show the accepted task label
    await expect(page.locator('.task-card')).toContainText('Hermes E2E Task', { timeout: 5000 });
  });
});

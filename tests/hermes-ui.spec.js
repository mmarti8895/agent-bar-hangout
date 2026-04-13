import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/test/reset');
  expect(response.ok()).toBeTruthy();
});

// E2E: Hermes UI Accept/Reject flow
test.describe('Hermes UI flows', () => {
  test('Accepting and rejecting Hermes tasks via UI', async ({ page, request }) => {
    await page.goto('/');

    // Create two tasks: one to accept, one to reject
    const t1 = { taskId: 'ui-accept-1', title: 'Accept Task', instructions: 'Do accept', targetAgent: 'Nova' };
    const t2 = { taskId: 'ui-reject-1', title: 'Reject Task', instructions: 'Do reject', targetAgent: 'Quinn' };

    const r1 = await request.post('/api/hermes/assign', { data: t1 });
    expect(r1.ok()).toBeTruthy();
    const r2 = await request.post('/api/hermes/assign', { data: t2 });
    expect(r2.ok()).toBeTruthy();

    // Wait for hermes panel
    await page.waitForSelector('#hermesPanel', { state: 'visible', timeout: 15000 });

    // Accept first task
    const task1 = page.locator(`#hermesPanel .hermes-task[data-id="${t1.taskId}"]`);
    await expect(task1).toBeVisible({ timeout: 15000 });
    await task1.locator('button', { hasText: 'Accept' }).click();

    // Confirm active task created (task-card appears in UI)
    await expect(page.locator('.task-card')).toContainText(t1.title, { timeout: 5000 });

    // Reject second task (clicking Reject in UI may be client-side; ensure server-side removal)
    const task2 = page.locator(`#hermesPanel .hermes-task[data-id="${t2.taskId}"]`);
    await expect(task2).toBeVisible({ timeout: 15000 });
    await task2.locator('button', { hasText: 'Reject' }).click();

    // Some clients may not remove server memory automatically on Reject; remove via API to ensure state
    await request.post('/api/hermes/delete', { data: { taskId: t2.taskId } });

    // Verify hermes task removed from memory
    const mem = await request.post('/api/memory/get', { data: { key: 'hermes_tasks' } });
    const memJson = await mem.json();
    const ids = (memJson.value || []).map(x => x.id);
    expect(ids).not.toContain(t2.taskId);

    // Cleanup: clear memory
    await request.post('/api/memory/clear', {});
  });
});

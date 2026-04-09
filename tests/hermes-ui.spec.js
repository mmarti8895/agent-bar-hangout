import { test, expect } from '@playwright/test';

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

    // Confirm active task created
    await expect(page.locator('.active-tasks .task-card')).toContainText(t1.title, { timeout: 5000 });

    // Reject second task
    const task2 = page.locator(`#hermesPanel .hermes-task[data-id="${t2.taskId}"]`);
    await expect(task2).toBeVisible({ timeout: 15000 });
    await task2.locator('button', { hasText: 'Reject' }).click();

    // Verify hermes task removed from memory by calling server API
    const mem = await request.post('/api/memory/get', { data: { key: 'hermes_tasks' } });
    const memJson = await mem.json();
    const ids = (memJson.value || []).map(x => x.id);
    expect(ids).not.toContain(t2.taskId);

    // Cleanup: clear memory
    await request.post('/api/memory/clear', {});
  });
});

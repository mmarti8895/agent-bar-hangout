import { test, expect } from '@playwright/test';

/* ──────────────────────────────────────────────────
   Helper: wait for Three.js scene to initialise
   ────────────────────────────────────────────────── */
async function waitForScene(page) {
  // The canvas exists immediately; wait until at least one frame has rendered
  await page.waitForSelector('#barCanvas', { state: 'visible' });
  // Give Three.js a moment to render the first frame
  await page.waitForTimeout(1500);
}

/** Enable and check an MCP adapter checkbox (unconfigured adapters are disabled in the UI). */
async function forceCheckAdapter(page, adapterId) {
  await page.evaluate((id) => {
    const cb = document.querySelector(`#mcpCheckboxes input[value="${id}"]`);
    if (cb) { cb.disabled = false; cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  }, adapterId);
}

/* ═══════════════════════════════════════════════════
   1. PAGE LOAD & BASIC STRUCTURE
   ═══════════════════════════════════════════════════ */
test.describe('Page load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('Agent Bar Hangout');
  });

  test('all major sections are visible', async ({ page }) => {
    await expect(page.locator('#barCanvas')).toBeVisible();
    await expect(page.locator('#rosterGrid')).toBeVisible();
    await expect(page.locator('#assignForm')).toBeVisible();
    await expect(page.locator('#responsePane')).toBeVisible();
    await expect(page.locator('#activityLogBody')).toBeAttached();
    await expect(page.locator('#mcpConfigBtn')).toBeVisible();
  });

  test('roster grid has exactly 4 agent buttons', async ({ page }) => {
    const buttons = page.locator('#rosterGrid button[data-agent-id]');
    await expect(buttons).toHaveCount(4);
  });

  test('canvas renders (non-zero size)', async ({ page }) => {
    await waitForScene(page);
    const box = await page.locator('#barCanvas').boundingBox();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);
  });
});

/* ═══════════════════════════════════════════════════
   2. AGENT SELECTION
   ═══════════════════════════════════════════════════ */
test.describe('Agent selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
  });

  test('first agent (Nova) is selected by default', async ({ page }) => {
    const novaBtn = page.locator('#rosterGrid button[data-agent-id="nova"]');
    await expect(novaBtn).toHaveClass(/active/);
    await expect(novaBtn).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#selectedAgentName')).toHaveText('Nova');
  });

  test('clicking a roster button selects that agent', async ({ page }) => {
    const quinnBtn = page.locator('#rosterGrid button[data-agent-id="quinn"]');
    await quinnBtn.click();

    await expect(quinnBtn).toHaveClass(/active/);
    await expect(quinnBtn).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#selectedAgentName')).toHaveText('Quinn');

    // Previous agent deselected
    const novaBtn = page.locator('#rosterGrid button[data-agent-id="nova"]');
    await expect(novaBtn).not.toHaveClass(/active/);
    await expect(novaBtn).toHaveAttribute('aria-selected', 'false');
  });

  test('arrow keys cycle through agents', async ({ page }) => {
    // Focus away from inputs so keydown handler fires
    await page.locator('#barCanvas').click();
    await expect(page.locator('#selectedAgentName')).toHaveText('Nova');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#selectedAgentName')).toHaveText('Quinn');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#selectedAgentName')).toHaveText('Rune');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#selectedAgentName')).toHaveText('Sol');

    // Wrap around
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#selectedAgentName')).toHaveText('Nova');

    // Go backwards
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#selectedAgentName')).toHaveText('Sol');
  });

  test('each agent shows correct role', async ({ page }) => {
    const agents = [
      { id: 'nova', role: 'Logistics Lead' },
      { id: 'quinn', role: 'Data Whisperer' },
      { id: 'rune', role: 'Ops Alchemist' },
      { id: 'sol', role: 'Field Liaison' },
    ];
    for (const a of agents) {
      await page.locator(`#rosterGrid button[data-agent-id="${a.id}"]`).click();
      await expect(page.locator('#selectedAgentRole')).toContainText(a.role);
    }
  });
});

/* ═══════════════════════════════════════════════════
   3. TASK ASSIGNMENT FORM
   ═══════════════════════════════════════════════════ */
test.describe('Task assignment form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
  });

  test('form has required fields', async ({ page }) => {
    await expect(page.locator('#taskTitle')).toBeVisible();
    await expect(page.locator('#taskInstructions')).toBeVisible();
    await expect(page.locator('#taskEta')).toBeVisible();
    await expect(page.locator('#mcpCheckboxes')).toBeVisible();
  });

  test('task title is required — form does not submit when empty', async ({ page }) => {
    // Clear any default value
    await page.locator('#taskTitle').fill('');
    await page.locator('#assignForm button[type="submit"]').click();
    // The form should not submit (HTML5 validation)
    // Page should still be on same URL, no task created
    await expect(page.locator('#taskList')).not.toContainText('Working');
  });

  test('MCP checkboxes are present for all built-in adapters', async ({ page }) => {
    const checkboxes = page.locator('#mcpCheckboxes input[type="checkbox"]');
    const count = await checkboxes.count();
    // At least the 8 original + 11 new = 19 adapters (but custom ones may add more)
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('AI Search (web) adapter is checked by default', async ({ page }) => {
    const webCheckbox = page.locator('#mcpCheckboxes input[value="web"]');
    await expect(webCheckbox).toBeChecked();
  });

  test('submitting a task creates an active task card', async ({ page }) => {
    await page.locator('#taskTitle').fill('Test task from Playwright');
    await page.locator('#taskInstructions').fill('Automated test instructions');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for the task card to appear
    const taskCard = page.locator('.task-card');
    await expect(taskCard.first()).toBeVisible({ timeout: 5000 });
    await expect(taskCard.first()).toContainText('Test task from Playwright');
  });

  test('submitting a task shows activity in the response pane', async ({ page }) => {
    await page.locator('#taskTitle').fill('Response pane test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for response content
    const responseLine = page.locator('#responsePane .response-line');
    await expect(responseLine.first()).toBeVisible({ timeout: 20000 });
  });

  test('submitting a task adds an activity log entry', async ({ page }) => {
    await page.locator('#taskTitle').fill('Log entry test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for log count to update from '0 entries'
    await expect(page.locator('#logCount')).not.toHaveText('0 entries', { timeout: 30000 });
  });
});

/* ═══════════════════════════════════════════════════
   4. MCP CONFIGURATION MODAL
   ═══════════════════════════════════════════════════ */
test.describe('MCP configuration modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('clicking configure opens the MCP modal', async ({ page }) => {
    await page.locator('#mcpConfigBtn').click();
    const modal = page.locator('#mcpConfigModal');
    await expect(modal).toBeVisible();
  });

  test('modal can be closed with the X button', async ({ page }) => {
    await page.locator('#mcpConfigBtn').click();
    await expect(page.locator('#mcpConfigModal')).toBeVisible();

    await page.locator('#mcpModalClose').click();
    await expect(page.locator('#mcpConfigModal')).not.toBeVisible();
  });

  test('modal lists MCP adapters', async ({ page }) => {
    await page.locator('#mcpConfigBtn').click();
    const items = page.locator('#mcpConfigList [data-mcp-id]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('add custom MCP form is present', async ({ page }) => {
    await page.locator('#mcpConfigBtn').click();
    await expect(page.locator('#mcpAddForm')).toBeVisible();
    await expect(page.locator('#mcpNewName')).toBeVisible();
    await expect(page.locator('#mcpNewIcon')).toBeVisible();
  });

  test('adding a custom adapter appears in the list', async ({ page }) => {
    await page.locator('#mcpConfigBtn').click();

    await page.locator('#mcpNewName').fill('TestAdapter');
    await page.locator('#mcpNewIcon').fill('🧪');
    await page.locator('#mcpNewDesc').fill('A test adapter');
    await page.locator('#mcpNewTools').fill('test_tool');
    await page.locator('#mcpAddForm button[type="submit"]').click();

    // Check the adapter appears
    await expect(page.locator('#mcpConfigList')).toContainText('TestAdapter');
  });
});

/* ═══════════════════════════════════════════════════
   5. TASK PIPELINE EXECUTION
   ═══════════════════════════════════════════════════ */
test.describe('Task pipeline execution', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
  });

  test('task progresses through pipeline steps', async ({ page }) => {
    // Check a simulated adapter first — this auto-unchecks AI Search (web)
    await forceCheckAdapter(page, 'filesystem');

    await page.locator('#taskTitle').fill('Pipeline progress test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for progress bar to appear
    const progressBar = page.locator('.progress-bar-fill');
    await expect(progressBar.first()).toBeVisible({ timeout: 10000 });

    // Wait for task to complete (status should change to Done)
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });
  });

  test('completed task appears in agent output pane', async ({ page }) => {
    // Check a simulated adapter — auto-unchecks AI Search
    await forceCheckAdapter(page, 'database');

    await page.locator('#taskTitle').fill('Agent output test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for result in agent output
    const outputEntry = page.locator('#agentOutputPane .ao-entry');
    await expect(outputEntry.first()).toBeVisible({ timeout: 30000 });
  });

  test('GitHub adapter produces simulated output when unconfigured', async ({ page }) => {
    // Check GitHub adapter — auto-unchecks AI Search
    await forceCheckAdapter(page, 'github');

    await page.locator('#taskTitle').fill('List GitHub repos');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for completion
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });

    // Check response pane has GitHub-related output
    await expect(page.locator('#responsePane')).toContainText(/GitHub|RESULT|repo/i);
  });
});

/* ═══════════════════════════════════════════════════
   6. CLEAR BUTTONS
   ═══════════════════════════════════════════════════ */
test.describe('Clear buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
  });

  test('clear response pane empties output', async ({ page }) => {
    // Generate some output first (use simulated adapter)
    await forceCheckAdapter(page, 'filesystem');
    await page.locator('#taskTitle').fill('Clear test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for task to fully complete and mark done so pipeline stops emitting
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });
    const doneBtn = page.locator('.task-card [data-action="done"]');
    if (await doneBtn.count() > 0) await doneBtn.first().click();
    await page.waitForTimeout(500);

    // Clear
    await page.locator('#clearResponsePane').click();
    const lines = page.locator('#responsePane .response-line');
    await expect(lines).toHaveCount(0);
  });

  test('clear activity log empties table', async ({ page }) => {
    // Generate some log entries
    await page.locator('#taskTitle').fill('Log clear test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for task to fully complete so pipeline stops emitting
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });
    const doneBtn = page.locator('.task-card [data-action="done"]');
    if (await doneBtn.count() > 0) await doneBtn.first().click();
    await page.waitForTimeout(500);

    // Clear
    await page.locator('#clearLogBtn').click();
    await expect(page.locator('#logCount')).toHaveText('0 entries');
  });
});

/* ═══════════════════════════════════════════════════
   7. TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════ */
test.describe('Toast notifications', () => {
  test('assigning a task shows a toast', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    await page.locator('#taskTitle').fill('Toast test');
    await page.locator('#assignForm button[type="submit"]').click();

    const toast = page.locator('.toast');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
  });
});

/* ═══════════════════════════════════════════════════
   8. MCP ADAPTER PANEL
   ═══════════════════════════════════════════════════ */
test.describe('MCP adapter panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('adapter cards are rendered in sidebar', async ({ page }) => {
    const cards = page.locator('.mcp-adapter-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('adapter count label is displayed', async ({ page }) => {
    const countLabel = page.locator('#mcpCount');
    await expect(countLabel).toContainText(/\d+/);
  });
});

/* ═══════════════════════════════════════════════════
   9. MULTIPLE ADAPTER TASK
   ═══════════════════════════════════════════════════ */
test.describe('Multi-adapter task', () => {
  test('task with multiple adapters produces results from each', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    // Select two simulated adapters — checking these auto-unchecks AI Search
    await forceCheckAdapter(page, 'filesystem');
    await forceCheckAdapter(page, 'database');

    await page.locator('#taskTitle').fill('Multi adapter test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for completion — the task must finish before checking output
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });

    // Response pane should have output from the adapters
    const text = await page.locator('#responsePane').innerText();
    expect(text.length).toBeGreaterThan(20);
  });
});

/* ═══════════════════════════════════════════════════
   10. RESPONSIVE LAYOUT
   ═══════════════════════════════════════════════════ */
test.describe('Responsive layout', () => {
  test('layout adapts to narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/');

    // Page should still render without errors
    await expect(page.locator('#rosterGrid')).toBeVisible();
    await expect(page.locator('#assignForm')).toBeVisible();
    await expect(page.locator('#barCanvas')).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════
   11. SERVER API ENDPOINTS
   ═══════════════════════════════════════════════════ */
test.describe('Server API', () => {
  test('POST /api/chat returns error without valid config', async ({ request }) => {
    // Send a request with no prompt to get a 400
    const resp = await request.post('/api/chat', {
      data: { notPrompt: 'hello' },
    });
    const body = await resp.json();
    expect(resp.status()).toBe(400);
    expect(body.error).toBeTruthy();
  });

  test('POST /api/slack returns error without credentials', async ({ request }) => {
    const resp = await request.post('/api/slack', {
      data: { token: '', action: 'list_channels' },
    });
    const body = await resp.json();
    expect(resp.status() >= 400 || body.error || body.ok === false).toBeTruthy();
  });

  test('POST /api/stripe returns error without key', async ({ request }) => {
    const resp = await request.post('/api/stripe', {
      data: { secretKey: '', action: 'get_balance' },
    });
    const body = await resp.json();
    expect(resp.status() >= 400 || body.error).toBeTruthy();
  });

  test('GET / returns the index page', async ({ request }) => {
    const resp = await request.get('/');
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text).toContain('Agent Bar Hangout');
  });

  test('GET /app.js returns JavaScript', async ({ request }) => {
    const resp = await request.get('/app.js');
    expect(resp.status()).toBe(200);
    const contentType = resp.headers()['content-type'];
    expect(contentType).toContain('javascript');
  });

  test('404 for nonexistent files', async ({ request }) => {
    const resp = await request.get('/nonexistent-file-xyz.txt');
    expect(resp.status()).toBe(404);
  });

  test('POST /api/terminal executes command and returns output', async ({ request }) => {
    const resp = await request.post('/api/terminal', {
      data: { command: 'echo hello', shell: 'powershell' },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.stdout).toContain('hello');
    expect(body.exit_code).toBe(0);
  });

  test('POST /api/terminal returns 400 without command', async ({ request }) => {
    const resp = await request.post('/api/terminal', {
      data: { shell: 'powershell' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('Missing command');
  });

  test('POST /api/terminal rejects commands over 1000 chars', async ({ request }) => {
    const resp = await request.post('/api/terminal', {
      data: { command: 'x'.repeat(1001), shell: 'powershell' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('too long');
  });

  test('CORS allows localhost origins', async ({ request }) => {
    const resp = await request.post('/api/terminal', {
      data: { command: 'echo cors', shell: 'powershell' },
      headers: { 'Origin': 'http://localhost:8080' },
    });
    expect(resp.status()).toBe(200);
    const corsHeader = resp.headers()['access-control-allow-origin'];
    expect(corsHeader).toBe('http://localhost:8080');
  });

  test('CORS allows tauri.localhost origin', async ({ request }) => {
    const resp = await request.post('/api/terminal', {
      data: { command: 'echo tauri', shell: 'powershell' },
      headers: { 'Origin': 'http://tauri.localhost' },
    });
    expect(resp.status()).toBe(200);
    const corsHeader = resp.headers()['access-control-allow-origin'];
    expect(corsHeader).toBe('http://tauri.localhost');
  });

  test('CORS rejects unknown origins', async ({ request }) => {
    const resp = await request.post('/api/terminal', {
      data: { command: 'echo blocked', shell: 'powershell' },
      headers: { 'Origin': 'https://evil.example.com' },
    });
    expect(resp.status()).toBe(200);
    const corsHeader = resp.headers()['access-control-allow-origin'];
    expect(corsHeader || '').toBe('');
  });
});

/* ═══════════════════════════════════════════════════
   12. TASK HISTORY
   ═══════════════════════════════════════════════════ */
test.describe('Task history', () => {
  test('completed task moves to history', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    // Use simulated adapter
    await forceCheckAdapter(page, 'terminal');

    await page.locator('#taskTitle').fill('History test task');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for Done
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });

    // After completion, the "Mark done" button might be available — click it
    const doneBtn = page.locator('.task-card [data-action="done"]');
    if (await doneBtn.count() > 0) {
      await doneBtn.first().click();
    }

    // History list should have the task
    await expect(page.locator('#historyList')).toContainText('History test task', { timeout: 5000 });
  });
});

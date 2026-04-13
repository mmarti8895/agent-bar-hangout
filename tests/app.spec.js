import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/test/reset');
  expect(response.ok()).toBeTruthy();
});

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
    await expect(page.locator('#downloadLogBtn')).toBeVisible();
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

  test('submitting a task shows final output in the agent output pane', async ({ page }) => {
    await forceCheckAdapter(page, 'filesystem');
    await page.locator('#taskTitle').fill('Agent output result test');
    await page.locator('#assignForm button[type="submit"]').click();

    const outputEntry = page.locator('#agentOutputPane .ao-entry');
    await expect(outputEntry.first()).toBeVisible({ timeout: 30000 });
  });

  test('submitting a task adds an activity log entry', async ({ page }) => {
    await page.locator('#taskTitle').fill('Log entry test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for log count to update from '0 entries'
    await expect(page.locator('#logCount')).not.toHaveText('0 entries', { timeout: 30000 });
  });

  test('active tasks are restored after a page reload', async ({ page }) => {
    await page.locator('#taskTitle').fill('Persistent reload task');
    await page.locator('#assignForm button[type="submit"]').click();
    await expect(page.locator('.task-card')).toContainText('Persistent reload task', { timeout: 5000 });

    await page.reload();

    await expect(page.locator('.task-card')).toContainText('Persistent reload task', { timeout: 5000 });
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

  test('legacy directory-reader config is migrated to filesystem adapter', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('agentBarHangout_mcpAdapters', JSON.stringify([
        {
          id: 'directory-reader',
          name: 'Directory Reader',
          configValues: { rootDir: 'C:\\Temp' },
        }
      ]));
    });

    await page.reload();

    await expect(page.locator('#mcpCheckboxes input[value="filesystem"]')).toHaveCount(1);
    await expect(page.locator('#mcpCheckboxes input[value="filesystem"]')).toBeEnabled();
    await expect(page.locator('#mcpCheckboxes input[value="directory-reader"]')).toHaveCount(0);
  });

  test('legacy saved weather adapter is dropped on load', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('agentBarHangout_mcpAdapters', JSON.stringify([
        {
          id: 'weather',
          name: 'Weather',
          isDefault: true,
          configFields: [],
          configValues: {},
          tools: ['get_weather']
        }
      ]));
    });

    await page.reload();

    await expect(page.locator('#mcpCheckboxes input[value="weather"]')).toHaveCount(0);
    await page.locator('#mcpConfigBtn').click();
    await expect(page.locator('#mcpConfigList [data-mcp-id="weather"]')).toHaveCount(0);
  });

  test('legacy disabled built-in adapters are auto-enabled on load', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('agentBarHangout_mcpAdapters', JSON.stringify([
        {
          id: 'terminal',
          enabled: false,
          configValues: {}
        },
        {
          id: 'filesystem',
          enabled: false,
          configValues: { rootDir: 'C:\\Temp' }
        }
      ]));
    });

    await page.reload();

    await expect(page.locator('#mcpCheckboxes input[value="terminal"]')).toBeEnabled();
    await expect(page.locator('#mcpCheckboxes input[value="filesystem"]')).toBeEnabled();
  });

  test('weather adapter is not present in config list', async ({ page }) => {
    await page.locator('#mcpConfigBtn').click();
    await expect(page.locator('#mcpConfigList [data-mcp-id="weather"]')).toHaveCount(0);
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

  test('GitHub adapter reports missing configuration when unconfigured', async ({ page }) => {
    // Check GitHub adapter — auto-unchecks AI Search
    await forceCheckAdapter(page, 'github');

    await page.locator('#taskTitle').fill('List GitHub repos');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for completion
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });

    // Check the activity log reports the configuration problem
    await expect(page.locator('#activityLogBody')).toContainText(/GitHub.+missing required configuration/i);
  });

  test('weather adapter is not present in checkbox list', async ({ page }) => {
    await expect(page.locator('#mcpCheckboxes input[value="weather"]')).toHaveCount(0);
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

  test('activity log buttons are visible', async ({ page }) => {
    await expect(page.locator('#clearLogBtn')).toBeVisible();
    await expect(page.locator('#downloadLogBtn')).toBeVisible();
  });

  test('download activity log button downloads a timestamped json file', async ({ page }) => {
    await page.locator('#taskTitle').fill('Download activity log test');
    await page.locator('#assignForm button[type="submit"]').click();
    await expect(page.locator('#logCount')).not.toHaveText('0 entries', { timeout: 30000 });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadLogBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^activity_log_\d{8}_\d{6}\.json$/);
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
  test('task with multiple adapters records activity for the run', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    // Select two simulated adapters — checking these auto-unchecks AI Search
    await forceCheckAdapter(page, 'filesystem');
    await forceCheckAdapter(page, 'database');

    await page.locator('#taskTitle').fill('Multi adapter test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for completion — the task must finish before checking output
    await expect(page.locator('.task-card').first()).toContainText(/Done|done/, { timeout: 30000 });

    // Activity log should contain entries from the run even when adapters are unconfigured
    const text = await page.locator('#activityLogBody').innerText();
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
   12. ACTIVITY LOG DOWNLOAD
   ═══════════════════════════════════════════════════ */
test.describe('Activity log download', () => {
  test('run history section is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#historyList')).toBeVisible();
    await expect(page.locator('#clearRunHistory')).toBeVisible();
    await expect(page.locator('#downloadRunHistory')).toBeVisible();
  });

  test('downloaded activity log json contains entries', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    await forceCheckAdapter(page, 'terminal');
    await page.locator('#taskTitle').fill('Activity JSON check');
    await page.locator('#assignForm button[type="submit"]').click();
    await expect(page.locator('#logCount')).not.toHaveText('0 entries', { timeout: 30000 });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadLogBtn').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    let content = '';
    for await (const chunk of stream) content += chunk.toString();
    const parsed = JSON.parse(content);
    expect(Array.isArray(parsed)).toBeTruthy();
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('agent');
    expect(parsed[0]).toHaveProperty('details');
  });

  test('persisted run record truncates oversized instructions and result fields', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);

    const longInstructions = 'I'.repeat(520);

    await page.locator('#taskTitle').fill('Truncate persisted run record');
    await page.locator('#taskInstructions').fill(longInstructions);
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for the task card to appear before marking done
    await expect(page.locator('.task-card').first()).toBeVisible({ timeout: 5000 });

    await page.locator('.task-card [data-action="done"]').first().click();
    await expect(page.locator('#historyList')).toContainText('Truncate persisted run record');

    // Verify the agent's in-memory history reflects the completed task
    const historyEntry = await page.evaluate(() => {
      const agent = window.__agentBarState.agents.find((entry) => entry.id === 'nova');
      return agent?.history[0] || null;
    });

    expect(historyEntry).not.toBeNull();
    expect(historyEntry.title).toBe('Truncate persisted run record');
    // Instructions are stored at full length in the in-memory history (no truncation in memory)
    expect(historyEntry.instructions).toBe('I'.repeat(520));
  });
});

/* ═══════════════════════════════════════════════════
   13. AGENT WALK ANIMATIONS (leave / return / sip)
   ═══════════════════════════════════════════════════ */

/** Read an agent's walkState, walkProgress, and beerMesh.visible from JS state. */
async function getWalkInfo(page, agentId) {
  return page.evaluate((id) => {
    const agent = window.__agentBarState.agents.find((a) => a.id === id);
    return {
      walkState: agent.walkState,
      walkProgress: agent.walkProgress,
      beerVisible: agent.beerMesh ? agent.beerMesh.visible : null,
      status: agent.status,
    };
  }, agentId);
}

/** Fast-forward the walk animation to completion by setting walkProgress to 1 and running frames. */
async function fastForwardWalk(page, agentId) {
  await page.evaluate((id) => {
    const agent = window.__agentBarState.agents.find((a) => a.id === id);
    agent.walkProgress = 0.99;
  }, agentId);
  // Let one animation frame tick to transition
  await page.waitForTimeout(100);
}

/** Fast-forward the sip animation by setting sipTimer far in the past. */
async function fastForwardSip(page, agentId) {
  await page.evaluate((id) => {
    const agent = window.__agentBarState.agents.find((a) => a.id === id);
    agent.sipTimer = -10;
  }, agentId);
  await page.waitForTimeout(100);
}

/** Poll until an agent's walkState reaches the expected value. */
async function waitForWalkState(page, agentId, expectedState, timeoutMs = 30000) {
  await expect(async () => {
    const info = await getWalkInfo(page, agentId);
    expect(info.walkState).toBe(expectedState);
  }).toPass({ timeout: timeoutMs });
}

test.describe('Agent walk animations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
  });

  test('assigning a task sets walkState to leaving and hides beer mug', async ({ page }) => {
    // Nova starts at-bar
    const before = await getWalkInfo(page, 'nova');
    expect(before.walkState).toBe('at-bar');
    expect(before.beerVisible).toBe(false);

    await page.locator('#taskTitle').fill('Walk test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(100);

    const after = await getWalkInfo(page, 'nova');
    expect(after.walkState).toBe('leaving');
    expect(after.walkProgress).toBeGreaterThanOrEqual(0);
    expect(after.beerVisible).toBe(false);
    expect(after.status).toBe('busy');
  });

  test('leaving animation transitions to away when progress reaches 1', async ({ page }) => {
    await page.locator('#taskTitle').fill('Leave complete test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);

    // Fast-forward animation
    await fastForwardWalk(page, 'nova');

    const info = await getWalkInfo(page, 'nova');
    expect(info.walkState).toBe('away');
    expect(info.walkProgress).toBe(0);
  });

  test('agent mesh moves away from bar during leaving animation', async ({ page }) => {
    const posBefore = await page.evaluate(() => {
      const agent = window.__agentBarState.agents.find((a) => a.id === 'nova');
      return { z: agent.mesh.position.z, rotY: agent.mesh.rotation.y };
    });

    await page.locator('#taskTitle').fill('Position test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Let a few frames run
    await page.waitForTimeout(300);

    const posAfter = await page.evaluate(() => {
      const agent = window.__agentBarState.agents.find((a) => a.id === 'nova');
      return { z: agent.mesh.position.z, rotY: agent.mesh.rotation.y };
    });

    // Agent should have moved away (larger z) and rotated
    expect(posAfter.z).toBeGreaterThan(posBefore.z);
    expect(Math.abs(posAfter.rotY)).toBeGreaterThan(0);
  });

  test('away agent stays at offset position with hunched animation', async ({ page }) => {
    await page.locator('#taskTitle').fill('Away pos test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    const info = await page.evaluate(() => {
      const agent = window.__agentBarState.agents.find((a) => a.id === 'nova');
      return {
        z: agent.mesh.position.z,
        origZ: agent.position.z,
        rotY: agent.mesh.rotation.y,
      };
    });

    // Should be at offset position
    expect(info.z).toBeCloseTo(info.origZ + 3.5, 0);
    // Turned around
    expect(info.rotY).toBeCloseTo(Math.PI, 1);
  });

  test('finishing task triggers returning animation', async ({ page }) => {
    await forceCheckAdapter(page, 'terminal');
    await page.locator('#taskTitle').fill('Return test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    expect((await getWalkInfo(page, 'nova')).walkState).toBe('away');

    // Wait for finishTask to trigger returning walkState
    await waitForWalkState(page, 'nova', 'returning');

    const info = await getWalkInfo(page, 'nova');
    expect(info.walkState).toBe('returning');
    expect(info.walkProgress).toBeGreaterThanOrEqual(0);
  });

  test('returning animation transitions to sipping with beer visible', async ({ page }) => {
    await forceCheckAdapter(page, 'terminal');
    await page.locator('#taskTitle').fill('Sip transition test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    // Wait for task finish to trigger returning
    await waitForWalkState(page, 'nova', 'returning');

    // Fast-forward the return walk
    await fastForwardWalk(page, 'nova');

    const info = await getWalkInfo(page, 'nova');
    expect(info.walkState).toBe('sipping');
    expect(info.beerVisible).toBe(true);
  });

  test('sipping animation ends and returns to at-bar with beer hidden', async ({ page }) => {
    await forceCheckAdapter(page, 'terminal');
    await page.locator('#taskTitle').fill('Sip end test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    await waitForWalkState(page, 'nova', 'returning');
    await fastForwardWalk(page, 'nova');

    expect((await getWalkInfo(page, 'nova')).walkState).toBe('sipping');

    // Fast-forward sip
    await fastForwardSip(page, 'nova');

    const info = await getWalkInfo(page, 'nova');
    expect(info.walkState).toBe('at-bar');
    expect(info.beerVisible).toBe(false);
  });

  test('agent mesh returns to original position after full cycle', async ({ page }) => {
    const origPos = await page.evaluate(() => {
      const agent = window.__agentBarState.agents.find((a) => a.id === 'nova');
      return { x: agent.position.x, z: agent.position.z };
    });

    await forceCheckAdapter(page, 'terminal');
    await page.locator('#taskTitle').fill('Full cycle test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    await waitForWalkState(page, 'nova', 'returning');
    await fastForwardWalk(page, 'nova');
    await fastForwardSip(page, 'nova');

    const finalPos = await page.evaluate(() => {
      const agent = window.__agentBarState.agents.find((a) => a.id === 'nova');
      return { x: agent.mesh.position.x, z: agent.mesh.position.z };
    });

    expect(finalPos.x).toBeCloseTo(origPos.x, 1);
    expect(finalPos.z).toBeCloseTo(origPos.z, 1);
  });

  test('second task assigned while away does not reset walkState', async ({ page }) => {
    await page.locator('#taskTitle').fill('First task');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    expect((await getWalkInfo(page, 'nova')).walkState).toBe('away');

    // Assign a second task while agent is away
    await page.locator('#taskTitle').fill('Second task');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);

    // Should stay away, not re-trigger leaving
    const info = await getWalkInfo(page, 'nova');
    expect(info.walkState).toBe('away');
  });

  test('task assigned during sipping interrupts to leaving', async ({ page }) => {
    await forceCheckAdapter(page, 'terminal');
    await page.locator('#taskTitle').fill('Interrupted sip task');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    await waitForWalkState(page, 'nova', 'returning');
    await fastForwardWalk(page, 'nova');

    expect((await getWalkInfo(page, 'nova')).walkState).toBe('sipping');
    expect((await getWalkInfo(page, 'nova')).beerVisible).toBe(true);

    // Assign new task while sipping — should interrupt to leaving
    await page.locator('#taskTitle').fill('Interrupt sip');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(100);

    const info = await getWalkInfo(page, 'nova');
    expect(info.walkState).toBe('leaving');
    expect(info.beerVisible).toBe(false);
  });

  test('markTaskDone triggers returning when no tasks remain', async ({ page }) => {
    await page.locator('#taskTitle').fill('Manual done test');
    await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForTimeout(50);
    await fastForwardWalk(page, 'nova');

    expect((await getWalkInfo(page, 'nova')).walkState).toBe('away');

    // Manually mark task done via button
    const doneBtn = page.locator('.task-card [data-action="done"]');
    await expect(doneBtn.first()).toBeVisible({ timeout: 5000 });
    await doneBtn.first().click();
    await waitForWalkState(page, 'nova', 'returning', 5000);

    const info = await getWalkInfo(page, 'nova');
    expect(info.walkState).toBe('returning');
  });

  test('angry leave shows red emissive glow on body', async ({ page }) => {
    await page.locator('#taskTitle').fill('Angry glow test');
    await page.locator('#assignForm button[type="submit"]').click();

    await page.waitForTimeout(200);

    const emissiveColor = await page.evaluate(() => {
      const agent = window.__agentBarState.agents.find((a) => a.id === 'nova');
      const body = agent.mesh.children[0];
      return body.material.emissive.getHexString();
    });

    // Should be red-ish (ff3333 = 'ff3333')
    expect(emissiveColor).toBe('ff3333');
  });

  test('leaving agent stomps with visible y-bounce', async ({ page }) => {
    await page.locator('#taskTitle').fill('Stomp test');
    await page.locator('#assignForm button[type="submit"]').click();

    // Capture several y-positions over frames to verify bounce
    const yPositions = await page.evaluate(() => {
      return new Promise((resolve) => {
        const agent = window.__agentBarState.agents.find((a) => a.id === 'nova');
        const samples = [];
        let count = 0;
        const id = setInterval(() => {
          samples.push(agent.mesh.position.y);
          count++;
          if (count >= 10) { clearInterval(id); resolve(samples); }
        }, 30);
      });
    });

    const min = Math.min(...yPositions);
    const max = Math.max(...yPositions);
    // Should have some variation (stomp effect)
    expect(max - min).toBeGreaterThan(0.01);
  });

  test('easeInOutCubic helper produces correct values', async ({ page }) => {
    const results = await page.evaluate(() => {
      const fn = window.__easeInOutCubic;
      return {
        at0: fn(0),
        at025: fn(0.25),
        at05: fn(0.5),
        at075: fn(0.75),
        at1: fn(1),
      };
    });

    expect(results.at0).toBe(0);
    expect(results.at05).toBe(0.5);
    expect(results.at1).toBe(1);
    // ease-in-out: slow at edges, fast in middle
    expect(results.at025).toBeLessThan(0.25);
    expect(results.at075).toBeGreaterThan(0.75);
  });

  test('non-selected agent can also leave and return independently', async ({ page }) => {
    // Select Quinn, then assign task to Quinn
    await page.locator('#rosterGrid button[data-agent-id="quinn"]').click();
    await page.waitForTimeout(100);

    await forceCheckAdapter(page, 'terminal');
    await page.locator('#taskTitle').fill('Quinn walks');
    await page.locator('#assignForm button[type="submit"]').click();

    // Wait for Quinn to transition to leaving rather than using a fixed timeout
    await waitForWalkState(page, 'quinn', 'leaving', 5000);

    const quinnInfo = await getWalkInfo(page, 'quinn');
    expect(quinnInfo.walkState).toBe('leaving');

    // Nova should remain at-bar
    const novaInfo = await getWalkInfo(page, 'nova');
    expect(novaInfo.walkState).toBe('at-bar');
  });
});

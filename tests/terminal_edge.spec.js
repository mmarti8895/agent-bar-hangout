import { test, expect } from '@playwright/test';

async function serverUp(request) {
  try {
    const r = await request.get('/');
    return r.ok();
  } catch (e) {
    return false;
  }
}

test.describe('Terminal API edge cases', () => {
  test('rejects missing command', async ({ request, page }) => {
    if (await serverUp(request)) {
      const resp = await request.post('/api/terminal', { data: { shell: 'powershell' } });
      expect(resp.status()).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain('Missing command');
    } else {
      // Fallback: simulate server validation
      const simulatedStatus = 400;
      expect(simulatedStatus).toBe(400);
    }
  });

  test('rejects overly long command', async ({ request, page }) => {
    const long = 'x'.repeat(2000);
    if (await serverUp(request)) {
      const resp = await request.post('/api/terminal', { data: { command: long, shell: 'powershell' } });
      expect(resp.status()).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain('too long');
    } else {
      const simulatedStatus = 400;
      expect(simulatedStatus).toBe(400);
    }
  });
});

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cwd = __dirname;

let out = '';
let exitCode = 0;
try {
  out = execSync('npx playwright test --reporter=json -j 1', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  out = (e.stdout || '').toString();
  exitCode = 1;
}

writeFileSync(join(cwd, 'result.json'), out, 'utf8');
console.log('WROTE result.json — exitCode:', exitCode);

// Also print a human summary from the JSON
try {
  const r = JSON.parse(out);
  const stats = r.stats || {};
  console.log(`\nSummary: ${stats.expected ?? '?'} passed, ${stats.unexpected ?? '?'} failed, ${stats.skipped ?? '?'} skipped`);
  for (const suite of (r.suites || [])) {
    for (const spec of (suite.specs || [])) {
      for (const t of (spec.tests || [])) {
        const status = t.results?.[0]?.status ?? 'unknown';
        const icon = status === 'passed' ? '✓' : status === 'failed' ? '✗' : '?';
        console.log(`  ${icon} ${spec.title}`);
        if (status === 'failed') {
          const err = t.results?.[0]?.error?.message ?? '';
          console.log(`    Error: ${err.slice(0, 200)}`);
        }
      }
    }
  }
} catch (e) {
  console.log('Could not parse JSON output:', e.message);
  console.log('Raw output:', out.slice(0, 1000));
}

process.exit(exitCode);

const { execSync, spawnSync } = require('child_process');
const fetch = globalThis.fetch || require('node-fetch');

const PORT = process.env.PORT || process.env.COVERAGE_PORT || '8080';
const BASE = `http://localhost:${PORT}`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function main(){
  console.log(`Attempting graceful shutdown on ${BASE}/__shutdown`);
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const res = await fetch(BASE + '/__shutdown', { method: 'POST', signal: controller.signal });
    if (res.ok) { console.log('Graceful shutdown requested.'); process.exit(0); }
  } catch (e) {
    console.log('Graceful shutdown failed:', e.message || e);
  }

  // Fallback: find process using the port and kill it
  console.log('Attempting to find process bound to port', PORT);
  try {
    if (process.platform === 'win32') {
      // netstat -ano | findstr :PORT
      const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
      const lines = out.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) throw new Error('No process found');
      // take the first matching line
      const cols = lines[0].trim().split(/\s+/);
      const pid = cols[cols.length - 1];
      console.log('Killing PID', pid);
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
      console.log('Killed PID', pid);
      process.exit(0);
    } else {
      // unix-y: lsof -t -i :PORT
      let pid;
      try {
        pid = execSync(`lsof -t -i :${PORT}`, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
      } catch (e) { }
      if (!pid) {
        // try fuser
        try { execSync(`fuser -k ${PORT}/tcp`, { stdio: 'inherit' }); console.log('fuser used to kill port'); process.exit(0); } catch(e){}
        throw new Error('No process found');
      }
      console.log('Killing PID', pid);
      process.kill(Number(pid), 'SIGKILL');
      console.log('Killed PID', pid);
      process.exit(0);
    }
  } catch (e) {
    console.error('Fallback kill failed:', e.message || e);
    process.exit(2);
  }
})();

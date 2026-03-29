#!/usr/bin/env node
/**
 * Ensures ~/.cargo/bin is in PATH, then spawns the given command.
 * Fixes "cargo not found" in fresh terminal sessions on Windows/macOS/Linux.
 *
 * Usage: node scripts/ensure-cargo.js <command> [args...]
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

const cargoBin = join(homedir(), '.cargo', 'bin');
if (existsSync(cargoBin) && !process.env.PATH.includes(cargoBin)) {
  process.env.PATH = cargoBin + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
}

const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd + ' ' + args.join(' '), { stdio: 'inherit', env: process.env, shell: true });
process.exit(result.status ?? 1);

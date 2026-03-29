#!/usr/bin/env node
/**
 * Copies frontend assets to dist/ for Tauri builds.
 * Tauri requires frontendDist to not include src-tauri/ or node_modules/.
 */
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, 'dist');

// Clean previous build
if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });

// Copy frontend files
const items = ['index.html', 'app.js', 'style.css', 'public'];
for (const item of items) {
  const src = resolve(__dirname, item);
  if (!existsSync(src)) continue;
  cpSync(src, resolve(dist, item), { recursive: true });
}

console.log('Frontend assets copied to dist/');

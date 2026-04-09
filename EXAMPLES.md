# Quick Examples & Quickstart

This file provides copy-paste commands to get started quickly with the project.

## Run dev server (web mode)

```bash
npm ci
node server.js
# open http://localhost:8080
```

## Run unit tests

```bash
node test-web-fetch.mjs
```

## Run Playwright E2E tests (headless)

```bash
npm ci
npx playwright install --with-deps
npx playwright test
```

## Assign a Hermes task (curl)

```bash
curl -X POST http://localhost:3000/api/hermes/assign \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"hermes-1","title":"Check inventory","instructions":"Count bottles","targetAgent":"Nova"}'
```

## Read memory (JS)

```js
const res = await fetch('http://localhost:3000/api/memory/get', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: 'hermes_tasks' }) });
const data = await res.json();
console.log(data);
```

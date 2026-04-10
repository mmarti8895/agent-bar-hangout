# Persistence & Migration Guide

This project uses a simple file-backed JSON `memories.json` for local development. It's intentionally lightweight and not suitable for production. Below are migration options and considerations.

Options:

- SQLite (production-ready): use `better-sqlite3` or `sqlite3` for local file-backed DB. Note: `better-sqlite3` is a native module and requires a compatible C/C++ toolchain on Windows and CI. Use Docker or devcontainers to ensure reproducible builds.

- PostgreSQL / Managed DB: Use Postgres for durable multi-process access. Add migrations (e.g., using `knex` or `sequelize`).

- sql.js (WASM): If you need a zero-native-deps SQLite alternative (browser-friendly), `sql.js` is a WebAssembly build of SQLite.

- Simple key-value stores: Redis for ephemeral memory with persistence via RDB/AOF.

Concurrency:

- File-backed writes should be serialized — the current implementation writes atomically via temp file + rename, but concurrent processes may overwrite each other's updates. Use DB transactions for concurrent access.

Schema ideas:

- `memories` table: `key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMP`
- `hermes_tasks` table: `id TEXT PRIMARY KEY, title TEXT, instructions TEXT, assignee TEXT, metadata JSONB, status TEXT, created_at TIMESTAMP`

Migration notes:

- To migrate from `memories.json` to SQLite/Postgres, write a small migration script that reads the JSON file and inserts rows into the target DB.
- Add backups before performing migrations in production.

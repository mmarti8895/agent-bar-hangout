# Contributing

Thanks for your interest in contributing to Agent Bar Hangout! Please follow these simple guidelines:

- Fork the repository and create a feature branch.
- Run `npm ci` and the tests locally before opening a PR:

```bash
node test-web-fetch.mjs
npx playwright test
```

- Keep changes focused and small. Add unit tests for new behavior.
- Follow the coding style in the repo. Run `npm run format` if available.
- Create a Pull Request against `main` and include a description of what changed and why.

We recommend opening an issue first for large or breaking changes.

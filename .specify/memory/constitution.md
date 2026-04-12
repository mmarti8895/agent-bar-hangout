<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Template principle slot 1 -> I. Code Quality Is a Product Requirement
- Template principle slot 2 -> II. Testing Is Non-Negotiable
- Template principle slot 3 -> III. UX Consistency and Accessibility
- Template principle slot 4 -> IV. Performance Must Be Designed In
- Template principle slot 5 -> V. Docs and Contracts Stay Current
Added sections:
- Engineering Guardrails
- Delivery Workflow
Removed sections:
- None
Templates requiring updates:
- updated: .specify/templates/plan-template.md
- updated: .specify/templates/spec-template.md
- updated: .specify/templates/tasks-template.md
- not applicable: .specify/templates/commands/ (directory not present; no command-template sync performed)
Follow-up TODOs:
- None
-->

# Agent Bar Hangout Constitution

## Core Principles

### I. Code Quality Is a Product Requirement
Every change MUST be grounded in repository evidence before code is edited. Implementations
MUST favor minimal, scoped diffs; preserve established architecture and naming patterns; and
avoid unrelated cleanup unless explicitly requested. New code MUST be readable, idiomatic for
its language, and leave the touched area easier to understand than before. When a proposed
change introduces new abstractions, patterns, or dependencies, the author MUST justify why the
existing implementation shape is insufficient.

Rationale: this project mixes desktop, web, and API surfaces, so unnecessary churn increases
regression risk and makes AI-assisted collaboration less reliable.

### II. Testing Is Non-Negotiable
Behavior changes MUST ship with automated tests in the smallest effective test layer, and unit
tests for new or changed code MUST reach 100% coverage unless an explicit, written exception is
approved in advance. Tests MUST be deterministic, MUST NOT call real AWS or external services in
unit scope, and MUST use fakes, mocks, or local adapters for time, network, and filesystem
boundaries when needed. Features that alter API contracts, persistence flows, or user-visible
journeys MUST add broader contract, integration, or end-to-end coverage in addition to unit
coverage where appropriate.

Rationale: this repository already relies on Playwright, unit coverage jobs, and API contract
documentation; the constitution turns those practices into a default engineering bar.

### III. UX Consistency and Accessibility
User-facing changes MUST preserve or intentionally extend established interaction patterns across
the browser and Tauri experiences. UI work MUST account for keyboard access, visible feedback,
clear error states, and consistency with existing selection, toast, and task-flow behavior unless
the spec explicitly approves a departure. Accessibility expectations, including semantic markup,
focus behavior, and readable status messaging, MUST be evaluated for every changed user journey.

Rationale: a visually distinctive product still fails users if interactions drift between screens
or become harder to operate, test, and support.

### IV. Performance Must Be Designed In
Every feature plan MUST identify the performance-sensitive paths it touches, such as rendering,
startup, request handling, or task orchestration, and MUST define how regressions will be checked
before release. Teams SHOULD use feature-level acceptance checks instead of arbitrary global
targets, but they MUST avoid changes that add unbounded work, repeated heavy computation, or
avoidable network latency on critical paths. If a change knowingly trades performance for product
value, that tradeoff MUST be documented in the plan and verified as acceptable.

Rationale: this application combines real-time UI, network-backed adapters, and local desktop
runtime behavior, so performance decisions need to be explicit even when hard global budgets are
not appropriate.

### V. Docs and Contracts Stay Current
Any change to user-visible behavior, setup, configuration, or APIs MUST update the relevant
documentation in the same delivery slice. README examples MUST stay copy-pasteable, and
`docs/openapi.yaml` MUST reflect current request/response behavior for documented endpoints. Plans,
tasks, and pull requests MUST call out documentation impacts rather than treating them as optional
cleanup.

Rationale: this project depends on docs for onboarding, local development, and API integration;
stale documentation creates real product defects.

## Engineering Guardrails

- Protected branches such as `main`, `master`, `develop`, `dev`, and `qa` MUST receive changes
  through reviewed pull requests; direct pushes or merges are forbidden.
- Secrets, tokens, private keys, and other credentials MUST NOT be committed, logged, or embedded
  in tests, fixtures, or examples.
- Networked code MUST use explicit timeouts, cancellation where supported, and bounded retries at
  system boundaries.
- Unit tests MUST isolate external systems, including AWS and third-party APIs, behind mocks,
  stubs, or local emulators.
- Contributors MUST keep scope tight to the requested application behavior and MUST NOT mix
  unrelated refactors into feature work without approval.

## Delivery Workflow

- Research the existing implementation, tests, and docs before proposing or making changes.
- Write a short plan that states goal, constraints, approach, files to change, and key risks, then
  review that plan twice before implementation.
- Implement in small, reviewable increments with tests added alongside the code they verify.
- Run targeted verification first, then the broader relevant suite before handing work off.
- Perform two self-review passes: one for correctness, security, and edge cases; one for
  readability, maintainability, and consistency with repo conventions.
- Treat constitution compliance as a required checkpoint during specification, planning, task
  generation, implementation, and review.

## Governance

This constitution supersedes conflicting local habits, ad hoc preferences, and undocumented
workflow shortcuts. All implementation plans MUST include a constitution check before work begins,
and any exception MUST be documented explicitly with rationale, scope, and approval path in the
planning artifacts. Silent exceptions are invalid.

Amendments follow semantic versioning for governance:

- MAJOR: removes a principle, weakens a non-negotiable rule, or changes governance in a backward
  incompatible way.
- MINOR: adds a principle, adds a mandatory section, or materially expands expected behavior.
- PATCH: clarifies wording, fixes ambiguity, or improves guidance without changing intent.

Compliance review is mandatory for every pull request, plan, and task list that claims readiness.
Reviewers and implementers share responsibility for verifying code quality, changed-code coverage,
UX consistency, performance impact, and documentation/API parity before changes are accepted.

**Version**: 1.0.0 | **Ratified**: 2026-04-11 | **Last Amended**: 2026-04-11

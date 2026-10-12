# Research plan for a provider-side contract testing RFC

## Purpose and deliverable

Research whether this architecture merits further investment, giving equal weight to:

- Running repeatable UI tests against provider-derived examples without the provider.
- The confidence those tests provide in provider/consumer compatibility.

Deliver one reviewable Markdown RFC with an evidence appendix. It should explain the approach, evaluate alternatives, recommend whether to continue, and identify specific decisions engineers can challenge. Do not presume adoption or implement architectural changes.

Write for engineers unfamiliar with this repository. Separate the general pattern from the NestJS, Angular, Vitest, Supertest, Playwright, and SQLite demonstration.

## 1. Establish the architecture and evidence

Trace the complete lifecycle through the provider tests, recorder, submission script, catalog service, client, and consumer tests. Include catalog-ui’s supporting role in discovery and inspection.

Use the reusable packages as the main starting points:

- `packages/scenario-recorder`: capture sessions, HTTP observation, runner adapters, publication, and file handling.
- `packages/contracts`: recorded-exchange format and validation boundaries.
- `packages/scenario-client`: selection, snapshots, routing, replay, and verification.

Cross-check README claims against implementation and tests. Record discrepancies rather than treating documentation as authoritative; some catalog documentation still describes automatic submission during merging.

Produce an evidence table for each consequential decision: current behavior, source location, supporting test, rationale, tradeoff, and plausible alternative. Label rationales as documented or inferred; do not attribute inferred intent to the author.

Record the checkout revision and relevant working-tree changes. Preserve existing changes.

## 2. Investigate the consequential decisions

| Area | Questions the research must answer |
|---|---|
| Capture and publication | Why capture explicitly selected requests through test adapters? What makes a recording eligible for publication? How do assertions, teardown, retries, parallel workers, filtered runs, empty runs, and interrupted publication affect the resulting catalog? |
| Exchange representation | What information survives capture? Evaluate JSON-only bodies, concrete paths, omitted queries and request headers, limited response headers, matching hints, schema versions, and trusted application TypeScript declarations. |
| Catalog distribution | Evaluate separate capture and submission, arbitrary-object storage versus scenario validation at the edges, SQLite persistence, replacement semantics, aliases, latest selection, collisions, and service availability. |
| Provenance and repeatability | Does submission-time Git metadata identify the code that produced the recordings? Investigate stale captures and dirty worktrees. Explain mutable commit entries, run-scoped snapshots, digest verification, and missing resolved-commit metadata. |
| Replay and test authoring | Evaluate strict versus fallback routing, optional body matching, ambiguous routes, explicit phase replacement, unused-scenario verification, repeated requests, and composition with native fixtures and existing mocks. |
| Coverage and maintenance | Who owns scenario IDs and fixtures? How do consumers discover missing cases, handle removed examples, and assemble coherent journeys from independent recordings? Assess determinism, schema evolution, and multiple providers. |
| Broader use | Identify material requirements for ownership, CI ordering, artifact retention, access control, sensitive payload handling, service operation, and portability. Separate prerequisites from possible future enhancements. |

For each area, distinguish prototype simplifications from decisions intrinsic to the approach.

## 3. Verify behavior and compare alternatives

Run existing focused tests and one isolated capture → local submission → UI replay walkthrough. Use temporary databases and generated artifacts; do not change implementation or publish to shared services. Record commands, outcomes, and environmental blockers.

Use existing tests where possible to verify:

- Passing capture publishes current-run examples; failed assertions or teardown preserve the previous catalog.
- Replacement and alias/latest lookup behave as documented.
- Workers and retries share a source snapshot within a run.
- Unknown scenarios, unmatched protected requests, unused selections, malformed JSON, and unsupported queries fail appropriately.
- Request changes outside matching hints can still receive recorded responses.
- Explicit replay phases require authors to supply coherent follow-up examples.

Build a **guarantee matrix** showing what provider assertions, schema validation, replay matching, and UI assertions each establish—and what they leave unchecked. Include concrete breaking-change and false-confidence examples. Distinguish demonstrated behavior from untested hypotheses; do not infer performance benefits without measurements.

Conduct a focused comparison using current primary documentation for consumer-driven contracts, OpenAPI/schema-based testing, conventional mocks, and live-provider E2E. Compare compatibility guarantees, independence, fidelity, authoring effort, maintenance, distribution, and CI coupling. Avoid an exhaustive vendor evaluation.

## 4. Distill the findings into the RFC

Organize the RFC around:

1. **Problem and decision requested:** whether to invest further, with both evaluation criteria stated.
2. **Proposed approach:** a framework-independent architecture diagram, lifecycle sequence, compact recorded-exchange example, and representative consumer journey.
3. **Architectural decisions:** concise explanations of consequential choices, their tradeoffs, and proposed alterations.
4. **Guarantees, limitations, and alternatives:** the guarantee matrix, demonstrated failure cases, and focused comparison.
5. **Recommendation and review questions:** continue, continue with specified changes, or stop; supporting evidence; unresolved questions; and bounded experiments needed to resolve them.

Keep source references, test evidence, and execution details in the appendix so the main RFC remains readable. Clearly distinguish current implementation, recommended changes, and optional future work.

## Completion criteria and defaults

- Every material architectural claim has repository evidence or a primary-source citation.
- Reviewers can understand the lifecycle and compatibility limits without reading implementation code.
- Recommendation criteria address both UI independence and compatibility confidence.
- Review questions name concrete choices and alternatives, allowing engineers to propose changes.
- Missing organizational requirements remain explicit unknowns; do not invent scale targets, operational owners, or deployment policies.
- Research and RFC authoring are the only intended changes; adoption and implementation remain subsequent decisions.

# Catalog UI

The Angular Scenario library browses catalogs submitted to the catalog API.
Install dependencies from the repository root with Node.js 24 and npm 11.8.0:

```sh
nvm use
npm ci
npm run dev --workspace=catalog-api
npm run dev --workspace=catalog-ui
```

Open http://localhost:4201/. The library lives at `/`; unknown UI paths redirect
there. The Petstore UI runs separately at http://localhost:4200/.
See the [workspace README](../../README.md) for combined development commands.

## Scenario library

The scenario library is available at `/`. It fetches
`/catalog-inventory` on entry and refresh, then loads the selected system from
`/catalogs/:systemName` (Latest) or `/catalogs/:systemName/:selector` (a commit).
The default is the first system alphabetically and Latest. The System and Version
selectors let you browse all submitted systems and commits, with aliases and
submission dates shown beside each commit. It never substitutes a local sample.

Run catalog-ui and the catalog API locally. Angular's development proxy forwards
`/catalog-inventory` and `/catalogs/**` to `http://localhost:3001`. Start the catalog
API before generating and merging petstore-api recordings; merging submits the catalog
automatically. See the [catalog API documentation](../catalog-api/README.md).

Categories, task groups, tags, and response-status choices come entirely from the
loaded catalog. Optional `title`, `category`, `group`, `tags`, and `description`
fields provide readable browsing metadata. Legacy entries use their stable ID as
the title and appear under **Uncategorized** when category is absent. Missing
metadata does not create filter choices. Request and response JSON remain exact
recorded examples, including `null` bodies.

System and version are stored in URL parameters `system` and `commit`; omitting
`commit` selects Latest. Changing either selector clears scenario filters and
details. Browser back/forward restores catalog selection and scenario state.
Refresh preserves valid selections and falls back to the first system or Latest
if a selected system or commit disappears.

Search, filters, and selected scenario are stored in URL query parameters (`q`,
`category`, `group`, `tag`, `status`, `scenario`). Removed values are cleared when
the catalog reloads. Browsing does not execute any scenario requests.

For production, configure your static host to serve the Angular application for
`/` and forward `/catalog-inventory` and `/catalogs/**` to the catalog
API on the same origin.
The development proxy is not included in the production build.

Component tests use arbitrary metadata unrelated to the Petstore API and run axe WCAG A/AA checks
against the test DOM. The DOM environment cannot evaluate browser layout or color
contrast; check those in a real browser at desktop and mobile widths as well.

## Verification and builds

Run from the repository root:

```sh
npm test --workspace=catalog-ui
npm run build --workspace=catalog-ui
```

Serve `apps/catalog-ui/dist/catalog-ui/browser` with your static host. Configure
UI path fallback and API forwarding as described above. No UI end-to-end runner
is configured in this repository.

## Shared contracts and UI

`@response-capture/contracts/scenarios` owns version 1 validation. Browsing now
rejects unknown schema fields and request-matching hints that contradict the recorded
body, using the same checks as the recorder. Legacy records without metadata remain
supported. The catalog API continues storing arbitrary JSON objects; an unsupported
payload shows the invalid-catalog state without changing the stored submission.

Theme controls, route focus, and common tokens come from `@response-capture/ui`.
The catalog theme continues using `response-capture:catalog-ui:theme` in local storage.

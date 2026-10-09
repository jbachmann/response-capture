# Consumer

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.26.

Install dependencies from the repository root with Node.js 24 and npm 11.8.0:

```sh
nvm use
npm ci
npm run dev --workspace=@response-capture/consumer
```

The commands below run from `apps/consumer` after that installation. Use
`npm exec -- ng` in place of `ng` if Angular CLI is not on your PATH.
See the [workspace README](../../README.md) for combined development and checks.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.
No UI end-to-end runner is configured in this repository yet.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Scenario library

The root route redirects to `/scenarios`. The browser fetches `/training/catalog`
on entry and when **Refresh catalog** is selected. It never substitutes a local
sample file. Run both applications locally; Angular's development proxy forwards
`/training/**` to `http://localhost:3000`.

Categories, task groups, tags, and response-status choices come entirely from the
loaded catalog. Optional `title`, `category`, `group`, `tags`, and `description`
fields provide readable browsing metadata. Legacy entries use their stable ID as
the title and appear under **Uncategorized** when category is absent. Missing
metadata does not create filter choices. Request and response JSON remain exact
recorded examples, including `null` bodies.

Search, filters, and selected scenario are stored in URL query parameters (`q`,
`category`, `group`, `tag`, `status`, `scenario`). Removed values are cleared when
the catalog reloads. Browsing does not execute any scenario requests.

For production, configure your static host to serve the Angular application for
`/scenarios` and forward `/training/catalog` to the provider on the same origin.
The development proxy is not included in the production build.

Component tests use arbitrary non-provider metadata and run axe WCAG A/AA checks
against the test DOM. The DOM environment cannot evaluate browser layout or color
contrast; check those in a real browser at desktop and mobile widths as well.

# Petstore UI

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.26.

Install dependencies from the repository root with Node.js 24 and npm 11.8.0:

```sh
nvm use
npm ci
npm run dev --workspace=@response-capture/petstore-ui
```

The commands below run from `apps/petstore-ui` after that installation. Use
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

## Petstore

The root route redirects to `/pets`. Navigation links Pets and Orders. The
Scenario library is hosted separately in [catalog-ui](../catalog-ui/README.md).
The petstore-ui and petstore-api must both be running; the petstore-ui uses the petstore-api's
real data, with no local mock fallback. The former `/scenarios` URL redirects to
`/pets`.

- Browse pets and inventory, search names, and filter by status and exact tag.
  Status changes apply immediately; use **Apply filters** or Enter to apply a tag.
  Combined filters intersect the petstore-api results; name search is local.
- Add, edit, and delete pets. Name is required; photos, category, and tags are
  optional. Add photo URLs one per line. Editing preserves existing category/tag
  IDs and unchanged photo arrays; removing a tag or clearing a named category
  deliberately removes it. Only HTTP/HTTPS photos are displayed, with a fallback
  for missing or broken images.
- Order available pets with a positive whole-number quantity and an optional
  shipping date in local time. The petstore-ui rechecks availability before ordering.
  The API still permits ordering any status; this UI restriction is not a server
  guarantee. Order operations never change pet status.
- **Orders** lists all saved orders, newest first, with links to order and pet
  details. Refresh the list to see updates from other users. ID lookup remains
  available, and orders can be deleted after confirmation from their detail page.
  The list comes from `GET /store/order` and includes training/demo orders.
  Delete referencing orders before deleting a pet.
- When inventory is empty, **Load demo data** offers a confirmed training reset.
  It replaces all pets and orders, including records another user may have added
  since the page loaded. Seeding is never automatic. Database clearing is not
  exposed by the UI.

The development proxy forwards `/pet`, `/pet/**`, `/store/**`, and `/training/**`
to `http://localhost:3000`. In production, forward these API paths to the petstore-api
on the same origin and serve the Angular `index.html` for petstore-ui paths including
`/pets`, `/pets/new`, `/pets/:id`, `/pets/:id/edit`, `/orders`, and `/orders/:id`.
Never apply the Angular fallback to API paths.

Run `npm test --workspace=@response-capture/petstore-ui` and
`npm run build --workspace=@response-capture/petstore-ui` from the repository root.
Petstore tests cover HTTP contracts, filter cancellation/intersection, edit
preservation, order eligibility, validation, confirmations, failures, and axe
WCAG A/AA DOM checks. Browser checks are also needed for contrast and layout.

# SQLite Petstore API

A NestJS training and education API using classic Swagger Petstore models and singular `/pet` and
`/store` routes. Pets and orders are persisted in SQLite. The original
`GET /` endpoint still returns `Hello World!`.

## Setup

Use **Node.js 24** and **npm 11.8.0** (see the root `.nvmrc` and `package.json`).
Install from the repository root:

```sh
nvm use
npm ci
npm run dev --workspace=@response-capture/provider
```

After installation, the commands below can be run from `apps/provider`; from
the root, append `--workspace=@response-capture/provider` to an npm command.
See the [workspace README](../../README.md) for combined development and checks.

The server listens on port `3000`; set `PORT` to override it. For a production
build, run `npm run build` followed by `npm run start:prod`.

SQLite uses Node's built-in `node:sqlite` `DatabaseSync`, with no ORM or native
SQLite dependency. Node 24 emits an `ExperimentalWarning` for SQLite; this is
expected and does not prevent startup. See the [Node SQLite documentation](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).

Swagger UI is available at **http://localhost:3000/docs** and the OpenAPI JSON
at **http://localhost:3000/docs-json**. Both production and end-to-end tests use
the same validation and documentation setup.

## Database configuration

`DATABASE_PATH` defaults to `./data/petstore.sqlite`, relative to the process's
working directory (`apps/provider` when launched through workspace scripts).
The default file is therefore `apps/provider/data/petstore.sqlite` from the
repository root. Parent directories and the two tables (`pets`, `orders`)
are created at startup, starting empty. Training endpoints can reset the data. Existing records survive restarts.

```sh
DATABASE_PATH=./data/local.sqlite npm run start:dev
```

Use `DATABASE_PATH=:memory:` for an ephemeral database. File databases and their
journals are ignored by Git. Category, tags, and photo URLs are stored as JSON
in each pet record; orders reference pets through a foreign key. Foreign keys
are enabled on the shared connection, which closes on application shutdown,
including SIGINT/SIGTERM. Pet and order repositories own CRUD SQL and row
mapping, using bound parameters. Services apply defaults and translate
application errors. Database operations are synchronous.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/pet` | Create a pet, generating its ID (201) |
| GET | `/pet` | List all pets in ID order (200) |
| PUT | `/pet` | Replace an existing pet using its required ID (200) |
| GET | `/pet/findByStatus?status=available,pending` | Match any supplied status (200) |
| GET | `/pet/findByTags?tags=cute&tags=small` | Match any supplied tag name (200) |
| GET | `/pet/:petId` | Read a pet (200) |
| DELETE | `/pet/:petId` | Delete an unreferenced pet (204) |
| GET | `/store/inventory` | Count each pet status, including zero counts (200) |
| POST | `/store/order` | Create an order for an existing pet (201) |
| GET | `/store/order/:orderId` | Read an order (200) |
| DELETE | `/store/order/:orderId` | Delete an order (204) |
| POST | `/training/seed` | Clear and repopulate static training data (200) |
| DELETE | `/training/database` | Clear all pets and orders (204) |

Pets require a nonblank `name` and a `photoUrls` array of strings (which may be
empty). Optional category and tag objects accept positive safe integer `id`
and nonblank `name` fields. Pet status is `available` (default), `pending`, or
`sold`; tags default to `[]`. `PUT /pet` replaces the record: omitted category
is removed, and omitted tags and status reset to their defaults.

Filters accept repeated query parameters, comma-separated values, or both;
results match any value and appear in ID order. Missing or empty filters and
invalid statuses return 400. Tag searches match tag names exactly.

Orders require an existing positive safe integer `petId`. `quantity` is a
positive safe integer defaulting to `1`; optional `shipDate` is an ISO 8601
date-time. Status is `placed` (default), `approved`, or `delivered`; `complete`
is a boolean defaulting to `false`. Creating or deleting orders leaves pet
status unchanged. Orders have no customer or user reference.

IDs are generated on creation. Lookup IDs must be positive safe integers.
Unknown properties, invalid nested fields, invalid enums, and other malformed
inputs return **400**. Missing pets or orders (including the pet on a new order)
return **404**. Deleting a pet referenced by an order returns **409**.
Delete the referencing orders before deleting that pet.

## Training database resets

These unauthenticated endpoints are intended for classroom exercises. Both
replace the current database contents and reset pet and order IDs. They take
no request body and are available in Swagger UI under `training`.

```sh
# Replace existing data with the same static dataset each time
curl -X POST http://localhost:3000/training/seed
# Response: {"pets":6,"orders":3,"inventory":{"available":2,"pending":2,"sold":2}}

# Remove all pets and orders; returns 204 with no body
curl -X DELETE http://localhost:3000/training/database
```

The seed contains Milo, Luna, Bella, Max, Coco, and Pip, with categories, tags,
and all three pet statuses. Three orders cover `placed`, `approved`, and
`delivered`, including shipping dates and completion flags. Inventory is
computed from pets rather than stored separately. Seeding preserves those
pet statuses regardless of their orders.

Both operations use a transaction and delete orders before pets so foreign
keys remain enabled. If seeding fails, the original data is restored.
Repeated seeding produces the same data and IDs; repeated clearing succeeds
on an empty database. Resetting retains the schema and the database file.
No data is automatically seeded at startup. Static examples live in
`src/pet-store/seed-data.ts`.

## Examples

```sh
# Create a pet (do not send an ID)
curl -X POST http://localhost:3000/pet \
  -H 'Content-Type: application/json' \
  -d '{"name":"Milo","photoUrls":[],"category":{"name":"Cats"},"tags":[{"name":"cute"}]}'

# Replace pet 1
curl -X PUT http://localhost:3000/pet \
  -H 'Content-Type: application/json' \
  -d '{"id":1,"name":"Milo","photoUrls":[],"status":"pending"}'

curl 'http://localhost:3000/pet/findByStatus?status=available&status=pending'
curl 'http://localhost:3000/pet/findByTags?tags=cute,small'
curl http://localhost:3000/store/inventory

# Order pet 1
curl -X POST http://localhost:3000/store/order \
  -H 'Content-Type: application/json' \
  -d '{"petId":1,"quantity":2,"shipDate":"2026-10-10T12:00:00Z"}'
curl http://localhost:3000/store/order/1

# Remove the order before the pet
curl -X DELETE http://localhost:3000/store/order/1
curl -X DELETE http://localhost:3000/pet/1
```

## Verification and scope

```sh
npm test
npm run test:e2e
npm run build
npm run lint
```

End-to-end tests use isolated temporary SQLite files, clean them up, and verify
persistence after application shutdown and reopening. Feature suites share
application setup and cover CRUD, filters, inventory, defaults, relationship
conflicts, validation, and Swagger UI and request/response schemas. Repository
tests exercise serialization, constraints, and shared transactions directly.

This API includes no user accounts, authentication, uploads, bulk operations,
XML, pagination, payments, or deployment changes.

## Recording API scenarios

Integration tests can explicitly record asserted JSON interactions using the
[test-only API scenario recorder](test/support/api-scenario-recorder/README.md).
The Petstore end-to-end suites record 55 named scenarios covering pet and order
CRUD, inventory, conflicts, persistence, training resets, invalid IDs, and empty
responses. Recorders flush after each opted-in test completes its assertions.

```sh
rm -rf artifacts/api-scenarios
npm run test:e2e
npm run scenarios:merge
```

This generates gitignored suite files and `artifacts/api-scenarios/catalog.json`.
Use synthetic fixtures and keep all scenario assertions inside the recorder
callback. Clear old recordings before a new run; the merger rejects duplicate
IDs across runs as well as across suites.

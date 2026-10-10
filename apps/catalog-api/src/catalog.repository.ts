import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CatalogSubmission, StoredCatalogSubmission } from './catalog-submission.js';
import type { CatalogInventoryResponse, CatalogInventorySystem } from './catalog-inventory.js';

type CatalogMetadataRow = {
  system_name: string;
  commit_hash: string;
  alias: string | null;
  submitted_at: string;
};

type CatalogSubmissionRow = CatalogMetadataRow & { catalog: string };

function versionFromRow(row: CatalogMetadataRow) {
  return {
    commitHash: row.commit_hash,
    ...(row.alias === null ? {} : { alias: row.alias }),
    submittedOn: row.submitted_at,
  };
}

function submissionFromRow(row: CatalogSubmissionRow): StoredCatalogSubmission {
  return {
    systemName: row.system_name,
    commitHash: row.commit_hash,
    ...(row.alias === null ? {} : { alias: row.alias }),
    catalog: JSON.parse(row.catalog) as Record<string, unknown>,
    submittedAt: row.submitted_at,
  };
}

@Injectable()
export class CatalogRepository implements OnModuleDestroy {
  private readonly db: DatabaseSync;

  constructor() {
    const path = process.env.CATALOG_DATABASE_PATH ?? './data/catalog.sqlite';
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(`
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS submission_sequence (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          value INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO submission_sequence VALUES (1, 0);
        CREATE TABLE IF NOT EXISTS catalog_submissions (
          system_name TEXT NOT NULL,
          commit_hash TEXT NOT NULL,
          alias TEXT,
          catalog TEXT NOT NULL,
          submitted_at TEXT NOT NULL,
          submission_sequence INTEGER NOT NULL,
          PRIMARY KEY (system_name, commit_hash)
        );
        CREATE INDEX IF NOT EXISTS catalog_latest
          ON catalog_submissions(system_name, submitted_at DESC, submission_sequence DESC);
        CREATE INDEX IF NOT EXISTS catalog_alias
          ON catalog_submissions(system_name, alias);
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  submit(submission: CatalogSubmission): void {
    const catalog = JSON.stringify(submission.catalog);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const sequence = this.db
        .prepare('UPDATE submission_sequence SET value = value + 1 WHERE id = 1 RETURNING value')
        .get() as { value: number };
      this.db
        .prepare(
          `
        INSERT INTO catalog_submissions VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(system_name, commit_hash) DO UPDATE SET
          alias = excluded.alias, catalog = excluded.catalog,
          submitted_at = excluded.submitted_at,
          submission_sequence = excluded.submission_sequence
      `,
        )
        .run(
          submission.systemName,
          submission.commitHash,
          submission.alias ?? null,
          catalog,
          new Date().toISOString(),
          sequence.value,
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  inventory(): CatalogInventoryResponse {
    const systems = new Map<string, CatalogInventorySystem>();
    const rows = this.db
      .prepare(
        `SELECT system_name, commit_hash, alias, submitted_at
         FROM catalog_submissions
         ORDER BY system_name ASC, submitted_at DESC, submission_sequence DESC`,
      )
      .all() as CatalogMetadataRow[];
    for (const row of rows) {
      const name = row.system_name;
      let system = systems.get(name);
      if (system === undefined) {
        system = { name, catalogs: [] };
        systems.set(name, system);
      }
      system.catalogs.push(versionFromRow(row));
    }
    return { systems: [...systems.values()] };
  }

  list(): StoredCatalogSubmission[] {
    const rows = this.db
      .prepare(
        `SELECT system_name, commit_hash, alias, catalog, submitted_at
       FROM catalog_submissions
       ORDER BY submitted_at DESC, submission_sequence DESC`,
      )
      .all() as CatalogSubmissionRow[];
    return rows.map(submissionFromRow);
  }

  latest(systemName: string, selector?: string): Record<string, unknown> | undefined {
    const row = (
      selector === undefined
        ? this.db
            .prepare(
              `SELECT catalog FROM catalog_submissions WHERE system_name = ?
          ORDER BY submitted_at DESC, submission_sequence DESC LIMIT 1`,
            )
            .get(systemName)
        : this.db
            .prepare(
              `SELECT catalog FROM catalog_submissions WHERE system_name = ?
          AND (alias = ? OR commit_hash = ?)
          ORDER BY submitted_at DESC, submission_sequence DESC LIMIT 1`,
            )
            .get(systemName, selector, selector)
    ) as { catalog: string } | undefined;
    return row ? (JSON.parse(row.catalog) as Record<string, unknown>) : undefined;
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}

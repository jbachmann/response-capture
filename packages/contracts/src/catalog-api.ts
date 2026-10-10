export interface CatalogSubmission {
  systemName: string;
  commitHash: string;
  alias?: string;
  catalog: Record<string, unknown>;
}

export interface StoredCatalogSubmission extends CatalogSubmission {
  submittedAt: string;
}

export interface CatalogVersion {
  commitHash: string;
  alias?: string;
  submittedOn: string;
}

export interface CatalogSystem {
  name: string;
  catalogs: CatalogVersion[];
}

export interface CatalogInventory {
  systems: CatalogSystem[];
}

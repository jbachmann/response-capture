export type CatalogInventorySystemCatalog = {
  commitHash: string;
  alias?: string;
  submittedOn: Date;
};

export type CatalogInventorySystem = {
  name: string;
  catalogs: CatalogInventorySystemCatalog[];
};

export type CatalogInventoryResponse = {
  systems: CatalogInventorySystem[];
};

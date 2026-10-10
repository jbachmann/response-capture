import { BadRequestException } from '@nestjs/common';

import type { CatalogSubmission } from '@response-capture/contracts/catalog-api';
export type {
  CatalogSubmission,
  StoredCatalogSubmission,
} from '@response-capture/contracts/catalog-api';

export function validateSubmission(value: unknown): asserts value is CatalogSubmission {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Submission must be a JSON object');
  }
  const submission = value as Record<string, unknown>;
  for (const field of ['systemName', 'commitHash']) {
    if (typeof submission[field] !== 'string' || !submission[field].trim()) {
      throw new BadRequestException(`${field} must be a nonblank string`);
    }
  }
  if (submission.alias !== undefined && typeof submission.alias !== 'string') {
    throw new BadRequestException('alias must be a string when supplied');
  }
  if (
    submission.catalog === null ||
    typeof submission.catalog !== 'object' ||
    Array.isArray(submission.catalog)
  ) {
    throw new BadRequestException('catalog must be a JSON object');
  }
}

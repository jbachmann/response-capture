import type { SchemaObject } from '@nestjs/swagger';

export const catalogInventorySchema: SchemaObject = {
  type: 'object',
  required: ['systems'],
  properties: {
    systems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'catalogs'],
        properties: {
          name: { type: 'string', example: 'provider' },
          catalogs: {
            type: 'array',
            items: {
              type: 'object',
              required: ['commitHash', 'submittedOn'],
              properties: {
                commitHash: { type: 'string', example: 'example-commit' },
                alias: { type: 'string', example: 'main' },
                submittedOn: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  },
};

export const catalogSubmissionsSchema: SchemaObject = {
  type: 'array',
  items: {
    type: 'object',
    required: ['systemName', 'commitHash', 'catalog', 'submittedAt'],
    properties: {
      systemName: { type: 'string', example: 'provider' },
      commitHash: { type: 'string', example: 'example-commit' },
      alias: { type: 'string', example: 'main' },
      catalog: { type: 'object', additionalProperties: true },
      submittedAt: { type: 'string', format: 'date-time' },
    },
  },
};

export const catalogSubmissionSchema: SchemaObject = {
  type: 'object',
  required: ['systemName', 'commitHash', 'catalog'],
  properties: {
    systemName: { type: 'string', pattern: '\\S', example: 'provider' },
    commitHash: {
      type: 'string',
      pattern: '\\S',
      example: 'example-commit',
    },
    alias: { type: 'string', example: 'main' },
    catalog: {
      type: 'object',
      additionalProperties: true,
      example: { catalogVersion: 1, scenarios: [] },
    },
  },
};

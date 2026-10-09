export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export const methods = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;
export type Method = (typeof methods)[number];
export interface RequestExample {
  method: Method;
  path: string;
  body: Json;
  match?: { bodyContains: { [key: string]: Json } };
}
export interface Scenario {
  schemaVersion: 1;
  id: string;
  description?: string;
  request: RequestExample;
  response: {
    status: number;
    headers?: { 'content-type': string };
    body: Json;
  };
}
export interface Catalog {
  catalogVersion: 1;
  scenarios: Scenario[];
}

function fail(context: string, field: string, message: string): never {
  throw new Error(`${context}: ${field} ${message}`);
}
function object(
  value: unknown,
  context: string,
  field: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    fail(context, field, 'must be an object');
  }
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  allowed: string[],
  context: string,
  field: string,
) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(context, `${field}.${key}`, 'is unknown');
}
export function validateJson(
  value: unknown,
  context: string,
  field: string,
  ancestors = new Set<unknown>(),
): asserts value is Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return;
  if (typeof value !== 'object') fail(context, field, 'must be a JSON value');
  if (ancestors.has(value)) fail(context, field, 'must not contain cycles');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++)
      validateJson(value[index], context, `${field}[${index}]`, ancestors);
    if (Object.keys(value).length !== value.length)
      fail(context, field, 'must not have extra array properties');
  } else {
    const record = object(value, context, field);
    for (const [key, entry] of Object.entries(record))
      validateJson(entry, context, `${field}.${key}`, ancestors);
  }
  if (Object.getOwnPropertySymbols(value).length)
    fail(context, field, 'must not have symbol keys');
  ancestors.delete(value);
}
export function isJsonContentType(value: string): boolean {
  return /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(value);
}
export function validateRequest(
  value: unknown,
  context: string,
): asserts value is RequestExample {
  const request = object(value, context, 'request');
  keys(request, ['method', 'path', 'body', 'match'], context, 'request');
  if (!methods.includes(request.method as Method))
    fail(context, 'request.method', `must be one of ${methods.join(', ')}`);
  if (
    typeof request.path !== 'string' ||
    !/^\/(?!\/)(?:[a-z0-9._~!$&'()*+,;=:@/-]|%[a-f0-9]{2})*$/i.test(
      request.path,
    ) ||
    /(?:^|\/):[^/]+/.test(request.path)
  ) {
    fail(
      context,
      'request.path',
      'must be a concrete relative pathname without query, fragment, or route placeholders',
    );
  }
  validateJson(request.body, context, 'request.body');
  if (request.match !== undefined) {
    const match = object(request.match, context, 'request.match');
    keys(match, ['bodyContains'], context, 'request.match');
    object(match.bodyContains, context, 'request.match.bodyContains');
    validateJson(match.bodyContains, context, 'request.match.bodyContains');
    if (!bodyContains(request.body as Json, match.bodyContains as Json))
      fail(
        context,
        'request.match.bodyContains',
        'must match the observed request body',
      );
  }
}
/** Objects are recursive subsets; arrays and scalar values require exact equality. */
export function bodyContains(actual: Json, expected: Json): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((entry, i) => exact(actual[i], entry))
    );
  if (expected !== null && typeof expected === 'object')
    return (
      actual !== null &&
      typeof actual === 'object' &&
      !Array.isArray(actual) &&
      Object.entries(expected).every(
        ([key, entry]) =>
          Object.hasOwn(actual, key) && bodyContains(actual[key], entry),
      )
    );
  return actual === expected;
}
function exact(actual: Json, expected: Json): boolean {
  if (
    expected !== null &&
    typeof expected === 'object' &&
    !Array.isArray(expected)
  )
    return (
      actual !== null &&
      typeof actual === 'object' &&
      !Array.isArray(actual) &&
      Object.keys(actual).length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([key, entry]) =>
          Object.hasOwn(actual, key) && exact(actual[key], entry),
      )
    );
  return bodyContains(actual, expected);
}
export function validateScenario(
  value: unknown,
  source = 'scenario',
): asserts value is Scenario {
  const scenario = object(value, source, 'scenario');
  const context = `${source} [${typeof scenario.id === 'string' && scenario.id.trim() ? scenario.id : 'unknown ID'}]`;
  keys(
    scenario,
    ['schemaVersion', 'id', 'description', 'request', 'response'],
    context,
    'scenario',
  );
  if (scenario.schemaVersion !== 1) fail(context, 'schemaVersion', 'must be 1');
  if (typeof scenario.id !== 'string' || !scenario.id.trim())
    fail(context, 'id', 'must be a nonempty stable string');
  if (
    scenario.description !== undefined &&
    typeof scenario.description !== 'string'
  )
    fail(context, 'description', 'must be a string');
  validateRequest(scenario.request, context);
  const response = object(scenario.response, context, 'response');
  keys(response, ['status', 'headers', 'body'], context, 'response');
  if (
    !Number.isInteger(response.status) ||
    (response.status as number) < 100 ||
    (response.status as number) > 599
  )
    fail(
      context,
      'response.status',
      'must be an integer HTTP status from 100 to 599',
    );
  validateJson(response.body, context, 'response.body');
  if (response.headers !== undefined) {
    const headers = object(response.headers, context, 'response.headers');
    keys(headers, ['content-type'], context, 'response.headers');
    if (
      typeof headers['content-type'] !== 'string' ||
      !isJsonContentType(headers['content-type'])
    )
      fail(
        context,
        'response.headers.content-type',
        'must be a JSON content type',
      );
  }
}
export function validateCatalog(
  value: unknown,
  source: string,
): asserts value is Catalog {
  const catalog = object(value, source, 'catalog');
  keys(catalog, ['catalogVersion', 'scenarios'], source, 'catalog');
  if (catalog.catalogVersion !== 1) fail(source, 'catalogVersion', 'must be 1');
  if (!Array.isArray(catalog.scenarios))
    fail(source, 'scenarios', 'must be an array');
  for (const scenario of catalog.scenarios) validateScenario(scenario, source);
}

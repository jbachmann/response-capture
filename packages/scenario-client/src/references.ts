import type { Json } from '@response-capture/contracts/scenarios';
import type { ScenarioExample } from './catalog.js';

export interface ScenarioReference<C extends string = string> {
  catalog: C;
  id: string;
}
export type ScenarioReferences<C extends string = string> = Record<string, ScenarioReference<C>>;

declare const scenarioBodies: unique symbol;

/** Trusted application types; the brand exists only in TypeScript declarations. */
export interface TypedScenarioReference<
  RequestBody = Json,
  ResponseBody = Json,
  C extends string = string,
> extends ScenarioReference<C> {
  readonly [scenarioBodies]: { readonly request: RequestBody; readonly response: ResponseBody };
}

export type ScenarioExampleFor<R> =
  R extends TypedScenarioReference<infer Request, infer Response>
    ? ScenarioExample<Request, Response>
    : ScenarioExample;

/** Declare body types once without loading a catalog or installing network handlers. */
export function scenarioReferences<const C extends string>(catalog: C) {
  return {
    define<RequestBody = Json, ResponseBody = Json>(
      id: string,
    ): TypedScenarioReference<RequestBody, ResponseBody, C> {
      return { catalog, id } as TypedScenarioReference<RequestBody, ResponseBody, C>;
    },
  };
}

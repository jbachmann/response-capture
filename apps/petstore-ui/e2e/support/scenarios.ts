import { bodyContains, type Json, type Scenario } from '@response-capture/contracts/scenarios';
import { http, HttpResponse, type RequestHandler } from 'msw';
import type { NetworkFixture } from '@msw/playwright';
import { ScenarioCatalog } from './catalog';

export interface ObservedRequest {
  method: string;
  url: string;
  body: Json;
}

interface RecordedRequest extends ObservedRequest {
  scenarioId?: string;
  matched: boolean;
}

/** One session per test. A phase replays exchanges, without inventing backend state. */
export class ScenarioSession {
  private readonly origin: string;
  private readonly requests: RecordedRequest[] = [];
  private readonly violations: string[] = [];
  private readonly phases: { ids: string[]; used: Set<string> }[] = [];

  constructor(
    private readonly catalog: ScenarioCatalog,
    baseUrl: string,
    private readonly network: Pick<NetworkFixture, 'resetHandlers'>,
  ) {
    this.origin = new URL(baseUrl).origin;
    this.network.resetHandlers(this.boundary());
  }

  use(...ids: string[]): void {
    const scenarios = ids.map((id) => this.catalog.get(id));
    const routes = new Set<string>();
    for (const scenario of scenarios) {
      const route = `${scenario.request.method} ${scenario.request.path}`;
      if (routes.has(route))
        throw new Error(`Ambiguous active scenarios for ${route}; select one per phase.`);
      routes.add(route);
    }
    const phase = { ids: [...ids], used: new Set<string>() };
    this.phases.push(phase);
    this.network.resetHandlers(
      ...scenarios.map((scenario) => this.handler(scenario, phase.used)),
      this.boundary(),
    );
  }

  calls(id: string): readonly ObservedRequest[] {
    this.catalog.get(id);
    return this.requests
      .filter((request) => request.matched && request.scenarioId === id)
      .map(({ method, url, body }) => structuredClone({ method, url, body }));
  }

  assertUsed(...ids: string[]): void {
    for (const id of ids) {
      if (!this.calls(id).length) throw new Error(`Selected scenario was not exercised: ${id}`);
    }
  }

  verify(): void {
    const unused = this.phases.flatMap((phase, index) =>
      phase.ids
        .filter((id) => !phase.used.has(id))
        .map((id) => `Unused scenario in phase ${index + 1}: ${id}`),
    );
    const errors = [...this.violations, ...unused];
    if (errors.length) throw new Error(`Catalog mock failures:\n${errors.join('\n')}`);
  }

  diagnostics() {
    return {
      phases: this.phases.map((phase) => ({ ids: phase.ids, used: [...phase.used] })),
      requests: this.requests,
      violations: this.violations,
    };
  }

  private handler(scenario: Scenario, used: Set<string>): RequestHandler {
    return http.all('*', async ({ request }) => {
      const url = new URL(request.url);
      if (
        request.method !== scenario.request.method ||
        url.origin !== this.origin ||
        url.pathname !== scenario.request.path
      )
        return undefined;
      const observed = await this.observe(request, scenario.id);
      if (!observed) return HttpResponse.error();
      const hint = scenario.request.match?.bodyContains;
      if (url.search) {
        return this.reject(`Catalog v1 does not model queries: ${request.method} ${request.url}`);
      }
      if (hint && !bodyContains(observed.body, hint)) {
        return this.reject(
          `${scenario.id}: bodyContains ${JSON.stringify(hint)} did not match ${JSON.stringify(observed.body)}`,
        );
      }
      observed.matched = true;
      used.add(scenario.id);
      const { status, headers, body } = scenario.response;
      if (request.method === 'HEAD' || [204, 205, 304].includes(status)) {
        return new HttpResponse(null, { status, headers });
      }
      return HttpResponse.json(body, { status, headers });
    });
  }

  private boundary(): RequestHandler {
    return http.all('*', async ({ request }) => {
      const url = new URL(request.url);
      if (/^\/(?:pet|store|training)(?:\/|$)/.test(url.pathname)) {
        await this.observe(request);
        return this.reject(`Unmatched API request: ${request.method} ${request.url}`);
      }
      // External photos consistently exercise the app's photo fallback.
      if (url.origin !== this.origin) return HttpResponse.error();
      // Adapter 0.4 uses getResponse(): no response lets Playwright continue the request.
      return undefined;
    });
  }

  private async observe(
    request: Request,
    scenarioId?: string,
  ): Promise<RecordedRequest | undefined> {
    const text = await request.text();
    let body: Json;
    try {
      body = text ? (JSON.parse(text) as Json) : null;
    } catch {
      this.violations.push(`Invalid JSON request body: ${request.method} ${request.url}: ${text}`);
      return undefined;
    }
    const observed = { method: request.method, url: request.url, body, scenarioId, matched: false };
    this.requests.push(observed);
    return observed;
  }

  private reject(message: string) {
    this.violations.push(message);
    return HttpResponse.error();
  }
}

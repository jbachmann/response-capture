import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { displayTitle, Scenario, statusLabel } from './catalog';

@Component({
  selector: 'app-scenario-detail',
  imports: [JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="detail-top">
      <span class="eyebrow">SCENARIO DETAILS</span
      ><button type="button" (click)="closed.emit()">Close details</button>
    </div>
    <h2>{{ title(scenario()) }}</h2>
    @if (scenario().description) {
      <p class="description">{{ scenario().description }}</p>
    }
    <p class="metadata">
      {{ scenario().category ?? 'Uncategorized' }}
      @if (scenario().group) {
        <span> / {{ scenario().group }}</span>
      }
    </p>
    @if (scenario().tags?.length) {
      <ul class="tags" aria-label="Tags">
        @for (tag of scenario().tags; track tag) {
          <li>{{ tag }}</li>
        }
      </ul>
    }
    <div class="outcome">
      <span class="eyebrow">EXPECTED RESPONSE</span
      ><strong>{{ status(scenario().response.status) }}</strong>
    </div>
    <h3>Request</h3>
    <p class="endpoint">
      <strong>{{ scenario().request.method }}</strong> <code>{{ scenario().request.path }}</code>
    </p>
    <pre aria-label="Request body">{{ scenario().request.body | json }}</pre>
    <h3>Response body</h3>
    <pre aria-label="Response body">{{ scenario().response.body | json }}</pre>
    <details>
      <summary>Additional details</summary>
      <h3>Scenario ID</h3>
      <p class="identifier">{{ scenario().id }}</p>
      @if (scenario().response.headers) {
        <h3>Response headers</h3>
        <pre>{{ scenario().response.headers | json }}</pre>
      }
      @if (scenario().request.match) {
        <h3>Request matching rules</h3>
        <pre>{{ scenario().request.match | json }}</pre>
      }
    </details>
  `,
  styleUrl: './scenario-detail.css',
})
export class ScenarioDetail {
  readonly scenario = input.required<Scenario>();
  readonly closed = output<void>();
  protected readonly title = displayTitle;
  protected readonly status = statusLabel;
}

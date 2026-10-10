import type { Scenario } from '@response-capture/contracts/scenarios';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { displayTitle, ScenarioCategory, statusLabel } from './scenario-filters';

@Component({
  selector: 'app-scenario-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-list.html',
  styleUrl: './scenario-list.css',
})
export class ScenarioList {
  readonly categories = input.required<ScenarioCategory[]>();
  readonly selectedId = input('');
  readonly selected = output<string>();
  protected readonly title = displayTitle;
  protected readonly status = statusLabel;
}

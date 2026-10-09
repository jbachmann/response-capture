import { Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'scenarios' },
  {
    path: 'scenarios',
    loadComponent: () => import('./scenarios/scenario-browser').then((m) => m.ScenarioBrowser),
  },
  { path: '**', redirectTo: 'scenarios' },
];

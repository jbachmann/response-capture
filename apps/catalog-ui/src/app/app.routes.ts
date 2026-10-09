import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Scenario library · Response Capture',
    loadComponent: () => import('./scenarios/scenario-browser').then((m) => m.ScenarioBrowser),
  },
  { path: '**', redirectTo: '' },
];

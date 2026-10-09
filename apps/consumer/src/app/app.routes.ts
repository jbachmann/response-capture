import { Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pets' },
  {
    path: 'pets',
    title: 'Pets · Petstore',
    loadComponent: () => import('./petstore/pet-list').then((m) => m.PetList),
  },
  {
    path: 'pets/new',
    title: 'Add pet · Petstore',
    loadComponent: () => import('./petstore/pet-editor').then((m) => m.PetEditor),
  },
  {
    path: 'pets/:id/edit',
    title: 'Edit pet · Petstore',
    loadComponent: () => import('./petstore/pet-editor').then((m) => m.PetEditor),
  },
  {
    path: 'pets/:id',
    title: 'Pet details · Petstore',
    loadComponent: () => import('./petstore/pet-detail').then((m) => m.PetDetail),
  },
  {
    path: 'orders',
    title: 'Orders · Petstore',
    loadComponent: () => import('./petstore/order-lookup').then((m) => m.OrderLookup),
  },
  {
    path: 'orders/:id',
    title: 'Order details · Petstore',
    loadComponent: () => import('./petstore/order-detail').then((m) => m.OrderDetail),
  },
  {
    path: 'scenarios',
    title: 'Scenario library',
    loadComponent: () => import('./scenarios/scenario-browser').then((m) => m.ScenarioBrowser),
  },
  { path: '**', redirectTo: 'pets' },
];

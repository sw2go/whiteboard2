import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'whiteboard',
    loadComponent: () =>
      import('./whiteboard/whiteboard.component').then((m) => m.WhiteboardComponent),
  },
  {
    path: 'whiteboard2',
    loadComponent: () =>
      import('./whiteboard2/whiteboard2.component').then((m) => m.Whiteboard2Component),
  },
];

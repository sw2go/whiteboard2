import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'whiteboard',
    loadComponent: () => import('./page1/page1.component').then((m) => m.Page1Component),
  },
  {
    path: 'whiteboard2',
    loadComponent: () => import('./page2/page2.component').then((m) => m.Page2Component),
  },
  {
    path: 'whiteboard3',
    loadComponent: () => import('./page3/page3.component').then((m) => m.Page3Component),
  },
  {
    path: 'whiteboard4',
    loadComponent: () => import('./page4/page4.component').then((m) => m.Page4Component),
  },
];

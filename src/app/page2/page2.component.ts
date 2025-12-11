import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Whiteboard2Component } from '../whiteboard2/whiteboard2.component';

@Component({
  selector: 'app-page2',
  imports: [Whiteboard2Component],
  template: `
    <h1>Page 2</h1>
    <app-whiteboard2 />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    h1 {
      margin: 0;
      padding: 0.5rem 1rem;
      font-size: 1.25rem;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
    }

    app-whiteboard2 {
      flex: 1;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Page2Component {}

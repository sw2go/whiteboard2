import { Component, ChangeDetectionStrategy } from '@angular/core';
import { WhiteboardComponent } from '../whiteboard/whiteboard.component';

@Component({
  selector: 'app-page1',
  imports: [WhiteboardComponent],
  template: `
    <h1>Page 1</h1>
    <app-whiteboard />
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

    app-whiteboard {
      flex: 1;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Page1Component {}

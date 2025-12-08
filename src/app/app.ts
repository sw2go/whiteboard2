import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WhiteboardComponent } from './whiteboard/whiteboard.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, WhiteboardComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('myclient');
}

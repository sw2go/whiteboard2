import { Component, ChangeDetectionStrategy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Whiteboard4Component, DrawMode } from '../whiteboard4/whiteboard4.component';

@Component({
  selector: 'app-page4',
  imports: [Whiteboard4Component, FormsModule],
  template: `
    <div class="page-container">
      <h1>Page 4</h1>

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-section">
          <label class="file-btn" for="openFile4">Open SVG</label>
          <input
            id="openFile4"
            type="file"
            accept=".svg,image/svg+xml"
            (change)="onFileSelected($event)"
            hidden
          />
          <button class="action-btn" (click)="saveSVG()" title="Save as SVG">Save SVG</button>
        </div>

        <div class="toolbar-section">
          <label class="input-label">
            Color:
            <input
              type="color"
              [value]="color()"
              (input)="color.set($any($event.target).value)"
              class="color-picker"
            />
          </label>

          <label class="input-label">
            Width:
            <input
              type="range"
              min="1"
              max="40"
              [value]="strokeWidth()"
              (input)="strokeWidth.set(+$any($event.target).value)"
              class="width-slider"
            />
            <span class="width-value">{{ strokeWidth() }}px</span>
          </label>
        </div>

        <div class="toolbar-section mode-group">
          <label class="mode-radio">
            <input
              type="radio"
              name="mode"
              value="draw"
              [checked]="mode() === 'draw'"
              (change)="mode.set('draw')"
            />
            Draw
          </label>
          <label class="mode-radio">
            <input
              type="radio"
              name="mode"
              value="erase"
              [checked]="mode() === 'erase'"
              (change)="mode.set('erase')"
            />
            Erase
          </label>
        </div>

        <div class="toolbar-section">
          <button class="action-btn danger" (click)="clearCanvas()" title="Clear canvas">Clear</button>
        </div>
      </div>

      <!-- Whiteboard -->
      <app-whiteboard4
        #whiteboard
        [color]="color()"
        [width]="strokeWidth()"
        [mode]="mode()"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100vh;
    }

    .page-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    h1 {
      margin: 0;
      padding: 0.5rem 1rem;
      font-size: 1.25rem;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
    }

    .toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 12px;
      background: #fff;
      border-bottom: 1px solid #ddd;
      user-select: none;
      flex-wrap: wrap;

      @media (max-width: 640px) {
        gap: 8px;
      }
    }

    .toolbar-section {
      display: flex;
      align-items: center;
      gap: 12px;

      @media (max-width: 640px) {
        gap: 8px;
      }
    }

    .mode-group {
      display: inline-flex;
      gap: 12px;
      align-items: center;
    }

    .mode-radio {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      cursor: pointer;
    }

    .input-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
    }

    .width-value {
      min-width: 32px;
    }

    .color-picker {
      width: 40px;
      height: 28px;
      border: 1px solid #aaa;
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
    }

    .width-slider {
      width: 80px;
      cursor: pointer;
    }

    .file-btn,
    .action-btn {
      padding: 6px 10px;
      border: 1px solid #aaa;
      border-radius: 6px;
      background: #fafafa;
      cursor: pointer;
      font-size: 14px;

      &:hover {
        background: #f0f0f0;
      }
    }

    .file-btn {
      display: inline-block;
    }

    .action-btn.danger {
      color: #d32f2f;

      &:hover {
        background: #ffebee;
        border-color: #d32f2f;
      }
    }

    app-whiteboard4 {
      flex: 1;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Page4Component {
  whiteboard = viewChild.required<Whiteboard4Component>('whiteboard');

  // Toolbar state
  color = signal('#0c62f0');
  strokeWidth = signal(6);
  mode = signal<DrawMode>('draw');

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      this.whiteboard().loadSvgContent(text);
    } catch (err) {
      console.error(err);
      alert('Failed to read file.');
    } finally {
      input.value = '';
    }
  }

  saveSVG(): void {
    this.whiteboard().saveSVG();
  }

  clearCanvas(): void {
    this.whiteboard().clearCanvas();
  }
}

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type DrawMode = 'draw' | 'pan' | 'erase';

interface Point {
  x: number;
  y: number;
}

interface Path {
  d: string;
  color: string;
  width: number;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-whiteboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './whiteboard.component.html',
  styleUrl: './whiteboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhiteboardComponent {
  private svgElement = viewChild.required<ElementRef<SVGSVGElement>>('svgCanvas');

  paths = signal<Path[]>([]);
  currentColor = signal('#000000');
  strokeWidth = signal(2);
  mode = signal<DrawMode>('draw');

  private isDrawing = false;
  private currentPath: Point[] = [];
  private lastPoint: Point | null = null;

  private isPanning = false;
  private panStartScreen: Point | null = null;

  private viewBox = signal<ViewBox>({ x: 0, y: 0, width: 1000, height: 1000 });
  private scale = signal(1);

  private touches: Map<number, Point> = new Map();
  private initialPinchDistance: number | null = null;
  private initialScale: number = 1;
  private pinchCenter: Point | null = null;

  viewBoxString = computed(
    () =>
      `${this.viewBox().x} ${this.viewBox().y} ${this.viewBox().width} ${this.viewBox().height}`
  );

  constructor() {
    effect(() => {
      this.updateViewBox();
    });
  }

  private updateViewBox(): void {
    if (typeof window === 'undefined') return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const currentScale = this.scale();

    this.viewBox.update((vb) => ({
      ...vb,
      width: width / currentScale,
      height: height / currentScale,
    }));
  }

  onWindowResize(): void {
    this.updateViewBox();
  }

  onPointerDown(event: PointerEvent): void {
    const point = this.getPoint(event);
    if (!point) return;

    if (this.mode() === 'draw') {
      this.startDrawing(point);
    } else if (this.mode() === 'pan') {
      const screenPoint = this.getScreenPoint(event);
      if (screenPoint) this.startPanning(screenPoint);
    } else if (this.mode() === 'erase') {
      this.eraseAt(point);
    }
  }

  onPointerMove(event: PointerEvent): void {
    const point = this.getPoint(event);
    if (!point) return;

    if (this.isDrawing && this.mode() === 'draw') {
      this.addPointToPath(point);
    } else if (this.isPanning && this.mode() === 'pan') {
      const screenPoint = this.getScreenPoint(event);
      if (screenPoint) this.pan(screenPoint);
    } else if (this.mode() === 'erase') {
      if (event.buttons === 1) {
        this.eraseAt(point);
      }
    }
  }

  onPointerUp(): void {
    if (this.isDrawing) {
      this.finishDrawing();
    }
    this.isPanning = false;
    this.panStartScreen = null;
  }

  onTouchStart(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i];
      const point = this.getTouchPoint(touch);
      if (point) {
        this.touches.set(touch.identifier, point);
      }
    }

    if (event.touches.length === 2) {
      this.initialPinchDistance = this.getPinchDistance();
      this.initialScale = this.scale();
      this.pinchCenter = this.getPinchCenter();
    } else if (event.touches.length === 1) {
      const point = this.getTouchPoint(event.touches[0]);
      if (!point) return;

      if (this.mode() === 'draw') {
        this.startDrawing(point);
      } else if (this.mode() === 'pan') {
        const screenPoint = this.getScreenPoint(event.touches[0]);
        this.startPanning(screenPoint);
      } else if (this.mode() === 'erase') {
        this.eraseAt(point);
      }
    }
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i];
      const point = this.getTouchPoint(touch);
      if (point) {
        this.touches.set(touch.identifier, point);
      }
    }

    if (event.touches.length === 2 && this.initialPinchDistance !== null) {
      this.handlePinchZoom();
    } else if (event.touches.length === 1) {
      const point = this.getTouchPoint(event.touches[0]);
      if (!point) return;

      if (this.isDrawing && this.mode() === 'draw') {
        this.addPointToPath(point);
      } else if (this.isPanning && this.mode() === 'pan') {
        const screenPoint = this.getScreenPoint(event.touches[0]);
        this.pan(screenPoint);
      } else if (this.mode() === 'erase') {
        this.eraseAt(point);
      }
    }
  }

  onTouchEnd(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      this.touches.delete(touch.identifier);
    }

    if (event.touches.length < 2) {
      this.initialPinchDistance = null;
      this.pinchCenter = null;
    }

    if (event.touches.length === 0) {
      if (this.isDrawing) {
        this.finishDrawing();
      }
      this.isPanning = false;
      this.panStartScreen = null;
    }
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();

    const point = this.getPoint(event);
    if (!point) return;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    this.zoomAt(point, zoomFactor);
  }

  private getScreenPoint(event: PointerEvent | MouseEvent | WheelEvent | Touch): Point {
    const svg = this.svgElement().nativeElement;
    const rect = svg.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private getPoint(event: PointerEvent | MouseEvent | WheelEvent): Point | null {
    const screenPoint = this.getScreenPoint(event);
    return this.screenToSVG(screenPoint);
  }

  private getTouchPoint(touch: Touch): Point | null {
    const svg = this.svgElement().nativeElement;
    const rect = svg.getBoundingClientRect();

    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    return this.screenToSVG({ x, y });
  }

  private screenToSVG(screenPoint: Point): Point {
    const svg = this.svgElement().nativeElement;
    const rect = svg.getBoundingClientRect();
    const vb = this.viewBox();

    const x = vb.x + (screenPoint.x / rect.width) * vb.width;
    const y = vb.y + (screenPoint.y / rect.height) * vb.height;

    return { x, y };
  }

  private startDrawing(point: Point): void {
    this.isDrawing = true;
    this.currentPath = [point];
    this.lastPoint = point;
  }

  private addPointToPath(point: Point): void {
    if (!this.isDrawing) return;

    this.currentPath.push(point);
    this.lastPoint = point;

    const pathData = this.pointsToPathData(this.currentPath);
    const tempPath: Path = {
      d: pathData,
      color: this.currentColor(),
      width: this.strokeWidth(),
    };

    this.paths.update((paths) => {
      const newPaths = paths.filter((p) => p !== paths[paths.length - 1] || !this.isDrawing);
      return [...newPaths, tempPath];
    });
  }

  private finishDrawing(): void {
    if (!this.isDrawing || this.currentPath.length === 0) {
      this.isDrawing = false;
      return;
    }

    const pathData = this.pointsToPathData(this.currentPath);
    const newPath: Path = {
      d: pathData,
      color: this.currentColor(),
      width: this.strokeWidth(),
    };

    this.paths.update((paths) => [...paths, newPath]);

    this.isDrawing = false;
    this.currentPath = [];
    this.lastPoint = null;
  }

  private pointsToPathData(points: Point[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  private startPanning(screenPoint: Point): void {
    this.isPanning = true;
    this.panStartScreen = screenPoint;
  }

  private pan(screenPoint: Point): void {
    if (!this.isPanning || !this.panStartScreen) return;

    const svg = this.svgElement().nativeElement;
    const rect = svg.getBoundingClientRect();
    const vb = this.viewBox();

    const dx = (screenPoint.x - this.panStartScreen.x) * (vb.width / rect.width);
    const dy = (screenPoint.y - this.panStartScreen.y) * (vb.height / rect.height);

    this.viewBox.update((vb) => ({
      ...vb,
      x: vb.x - dx,
      y: vb.y - dy,
    }));

    this.panStartScreen = screenPoint;
  }

  private zoomAt(center: Point, factor: number): void {
    const newScale = this.scale() * factor;

    if (newScale < 0.1 || newScale > 10) return;

    const vb = this.viewBox();
    const oldWidth = vb.width;
    const oldHeight = vb.height;

    const newWidth = oldWidth / factor;
    const newHeight = oldHeight / factor;

    const centerRatioX = (center.x - vb.x) / oldWidth;
    const centerRatioY = (center.y - vb.y) / oldHeight;

    const newX = center.x - centerRatioX * newWidth;
    const newY = center.y - centerRatioY * newHeight;

    this.scale.set(newScale);
    this.viewBox.set({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
  }

  private getPinchDistance(): number {
    const touchArray = Array.from(this.touches.values());
    if (touchArray.length < 2) return 0;

    const dx = touchArray[1].x - touchArray[0].x;
    const dy = touchArray[1].y - touchArray[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPinchCenter(): Point {
    const touchArray = Array.from(this.touches.values());
    if (touchArray.length < 2) return { x: 0, y: 0 };

    return {
      x: (touchArray[0].x + touchArray[1].x) / 2,
      y: (touchArray[0].y + touchArray[1].y) / 2,
    };
  }

  private handlePinchZoom(): void {
    if (this.initialPinchDistance === null || !this.pinchCenter) return;

    const currentDistance = this.getPinchDistance();
    const factor = currentDistance / this.initialPinchDistance;

    this.zoomAt(this.pinchCenter, factor / (this.scale() / this.initialScale));
  }

  private eraseAt(point: Point): void {
    const tolerance = 10 / this.scale();

    this.paths.update((paths) => {
      return paths.filter((path) => {
        return !this.isPointNearPath(point, path, tolerance);
      });
    });
  }

  private isPointNearPath(point: Point, path: Path, tolerance: number): boolean {
    const commands = path.d.match(/[ML]\s*[\d.-]+\s+[\d.-]+/g);
    if (!commands) return false;

    let lastPoint: Point | null = null;

    for (const cmd of commands) {
      const coords = cmd.match(/[\d.-]+/g);
      if (!coords || coords.length < 2) continue;

      const currentPoint: Point = {
        x: parseFloat(coords[0]),
        y: parseFloat(coords[1]),
      };

      if (lastPoint) {
        const distance = this.distanceToSegment(point, lastPoint, currentPoint);
        if (distance < tolerance) {
          return true;
        }
      }

      lastPoint = currentPoint;
    }

    return false;
  }

  private distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;

    if (length2 === 0) {
      return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    }

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
  }

  openSVG(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg';

    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        this.parseSVG(content);
      };
      reader.readAsText(file);
    };

    input.click();
  }

  private parseSVG(svgContent: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const pathElements = doc.querySelectorAll('path');

    const newPaths: Path[] = [];

    pathElements.forEach((pathEl) => {
      const d = pathEl.getAttribute('d');
      const stroke = pathEl.getAttribute('stroke') || '#000000';
      const strokeWidth = parseFloat(pathEl.getAttribute('stroke-width') || '2');

      if (d) {
        newPaths.push({
          d,
          color: stroke,
          width: strokeWidth,
        });
      }
    });

    this.paths.set(newPaths);

    // Fit the loaded content to viewport
    this.fitContentToView();
  }

  private fitContentToView(): void {
    if (this.paths().length === 0) return;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    this.paths().forEach((path) => {
      const coords = path.d.match(/[\d.-]+/g);
      if (coords) {
        for (let i = 0; i < coords.length; i += 2) {
          const x = parseFloat(coords[i]);
          const y = parseFloat(coords[i + 1]);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    });

    if (!isFinite(minX)) return;

    const padding = 50;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate scale to fit content with padding
    const scaleX = viewportWidth / (contentWidth + padding * 2);
    const scaleY = viewportHeight / (contentHeight + padding * 2);
    const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1:1

    this.scale.set(scale);

    // Center the content
    const viewBoxWidth = viewportWidth / scale;
    const viewBoxHeight = viewportHeight / scale;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.viewBox.set({
      x: centerX - viewBoxWidth / 2,
      y: centerY - viewBoxHeight / 2,
      width: viewBoxWidth,
      height: viewBoxHeight,
    });
  }

  saveSVG(): void {
    const svg = this.generateSVGContent();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `whiteboard-${Date.now()}.svg`;
    a.click();

    URL.revokeObjectURL(url);
  }

  private generateSVGContent(): string {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    this.paths().forEach((path) => {
      const coords = path.d.match(/[\d.-]+/g);
      if (coords) {
        for (let i = 0; i < coords.length; i += 2) {
          const x = parseFloat(coords[i]);
          const y = parseFloat(coords[i + 1]);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    });

    const padding = 20;
    minX = isFinite(minX) ? minX - padding : 0;
    minY = isFinite(minY) ? minY - padding : 0;
    maxX = isFinite(maxX) ? maxX + padding : 1000;
    maxY = isFinite(maxY) ? maxY + padding : 1000;

    const width = maxX - minX;
    const height = maxY - minY;

    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svgContent += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" style="width: 100vw; height: 100vh; display: block;">\n`;
    svgContent += `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/>\n`;

    this.paths().forEach((path) => {
      svgContent += `  <path d="${path.d}" stroke="${path.color}" stroke-width="${path.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    });

    svgContent += `</svg>`;

    return svgContent;
  }

  setMode(mode: DrawMode): void {
    this.mode.set(mode);
  }

  clearCanvas(): void {
    this.paths.set([]);
  }
}

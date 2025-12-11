import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  ElementRef,
  viewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type DrawMode = 'draw' | 'pan' | 'erase';

interface Point {
  x: number;
  y: number;
}

interface Path {
  id: string;
  d: string;
  color: string;
  width: number;
}

@Component({
  selector: 'app-whiteboard3',
  imports: [CommonModule, FormsModule],
  templateUrl: './whiteboard3.component.html',
  styleUrl: './whiteboard3.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onWindowResize()',
    '(window:keydown)': 'onKeyDown($event)',
    '(window:keyup)': 'onKeyUp($event)',
  },
})
export class Whiteboard3Component {
  private svgElement = viewChild.required<ElementRef<SVGSVGElement>>('svgCanvas');
  private contentGroup = viewChild.required<ElementRef<SVGGElement>>('contentGroup');

  // Public state
  paths = signal<Path[]>([]);
  currentColor = signal('#0c62f0');
  strokeWidth = signal(6);
  mode = signal<DrawMode>('draw');

  // Transform state: screen = translate + scale * world
  private scale = signal(1);
  private tx = signal(0);
  private ty = signal(0);
  private readonly MIN_SCALE = 0.05;
  private readonly MAX_SCALE = 20;

  // Drawing state
  private isDrawing = false;
  private activePath: SVGPathElement | null = null;
  private activePathColor: string = '';
  private activePathWidth: number = 0;

  // Pan state
  private isPanning = false;
  private panPointerId: number | null = null;
  private panAnchorWorld: Point | null = null;

  // Pointer tracking for pinch
  private pointers = new Map<number, Point>();

  // Pinch zoom state
  private pinchActive = false;
  private pinchInitialScale = 1;
  private pinchInitialDist = 1;
  private pinchAnchorWorld: Point | null = null;

  // Eraser state
  private erasePrevScreen: Point | null = null;

  // Space key state for PC panning
  private spacePressed = false;

  // Computed signals
  transform = computed(() => `translate(${this.tx()},${this.ty()}) scale(${this.scale()})`);

  status = computed(() => {
    const s = this.scale();
    const x = this.tx();
    const y = this.ty();
    const m = this.mode();
    return `scale=${s.toFixed(3)} tx=${x.toFixed(1)} ty=${y.toFixed(1)} | mode=${m}`;
  });

  cursor = computed(() => {
    const m = this.mode();
    if (m === 'pan' || this.spacePressed) return this.isPanning ? 'grabbing' : 'grab';
    return 'crosshair';
  });

  private nextId = 0;
  private generateId(): string {
    return `path-${Date.now()}-${this.nextId++}`;
  }

  onWindowResize(): void {
    // Transform-based approach doesn't need resize handling
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space' && !event.repeat) {
      this.spacePressed = true;
      // Prevent page scrolling
      event.preventDefault();
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spacePressed = false;
    }
  }

  // Coordinate conversions
  private getBoardRect(): DOMRect {
    return this.svgElement().nativeElement.getBoundingClientRect();
  }

  private screenToLocalCanvas(x: number, y: number): Point {
    const r = this.getBoardRect();
    return { x: x - r.left, y: y - r.top };
  }

  private screenToWorld(sx: number, sy: number): Point {
    const { x: cx, y: cy } = this.screenToLocalCanvas(sx, sy);
    return {
      x: (cx - this.tx()) / this.scale(),
      y: (cy - this.ty()) / this.scale(),
    };
  }

  private dist2D(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private sampleSegmentPoints(a: Point, b: Point, step = 8): Point[] {
    const d = this.dist2D(a, b);
    const n = Math.max(1, Math.ceil(d / step));
    const out: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  }

  private clampScale(s: number): number {
    return Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, s));
  }

  // Check if this event should trigger panning
  private shouldPan(event: PointerEvent): boolean {
    // Middle mouse button (button 1)
    if (event.button === 1) return true;
    // Space + left click
    if (this.spacePressed && event.button === 0) return true;
    // Pan mode with left click
    if (this.mode() === 'pan' && event.button === 0) return true;
    return false;
  }

  // Pointer events
  onPointerDown(event: PointerEvent): void {
    const svg = this.svgElement().nativeElement;
    svg.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Two-finger gesture on touch (pan + pinch zoom)
    if (this.pointers.size === 2) {
      if (this.mode() !== 'erase') {
        this.cancelDraw(); // Cancel without saving the dot from first finger
        this.isPanning = false;
        this.startPinch();
        return;
      }
    }

    // Check for pan triggers (middle mouse, space+click, pan mode)
    if (this.shouldPan(event)) {
      this.startPan(event);
      return;
    }

    if (this.mode() === 'draw') {
      this.startDraw(event);
    } else if (this.mode() === 'erase') {
      this.startErase(event);
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (this.pinchActive) {
      this.updatePinch();
      return;
    }

    // Handle panning (from middle mouse, space+drag, or pan mode)
    if (this.isPanning) {
      this.continuePan(event);
      return;
    }

    if (this.mode() === 'draw') {
      this.continueDraw(event);
    } else if (this.mode() === 'erase') {
      this.continueErase(event);
    }
  }

  onPointerUp(event: PointerEvent): void {
    const svg = this.svgElement().nativeElement;

    if (this.pointers.has(event.pointerId)) {
      this.pointers.delete(event.pointerId);
    }

    if (this.pinchActive && this.pointers.size < 2) {
      this.endPinch();
    }

    // Always try to end pan (handles middle mouse, space+drag, pan mode)
    if (this.isPanning) {
      this.endPan(event);
    }

    if (this.mode() === 'draw') {
      this.endDraw();
    } else if (this.mode() === 'erase') {
      this.endErase();
    }

    svg.releasePointerCapture(event.pointerId);
  }

  onPointerCancel(event: PointerEvent): void {
    const svg = this.svgElement().nativeElement;

    if (this.pointers.has(event.pointerId)) {
      this.pointers.delete(event.pointerId);
    }

    if (this.pinchActive && this.pointers.size < 2) {
      this.endPinch();
    }

    this.endDraw();
    this.endPan(event);
    this.endErase();

    svg.releasePointerCapture(event.pointerId);
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();

    const factor = Math.pow(1.0015, -event.deltaY);
    const anchorWorld = this.screenToWorld(event.clientX, event.clientY);
    const anchorCanvas = this.screenToLocalCanvas(event.clientX, event.clientY);
    const newScale = this.clampScale(this.scale() * factor);

    this.tx.set(anchorCanvas.x - newScale * anchorWorld.x);
    this.ty.set(anchorCanvas.y - newScale * anchorWorld.y);
    this.scale.set(newScale);
  }

  // Drawing - uses direct DOM manipulation for performance, then saves to signal
  private startDraw(event: PointerEvent): void {
    if (this.pointers.size > 1) return;

    this.isDrawing = true;
    const { x, y } = this.screenToWorld(event.clientX, event.clientY);

    // Store color and width at start of drawing
    this.activePathColor = this.currentColor();
    this.activePathWidth = this.strokeWidth();

    // Create SVG path element directly for smooth drawing
    this.activePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.activePath.setAttribute('fill', 'none');
    this.activePath.setAttribute('stroke', this.activePathColor);
    this.activePath.setAttribute('stroke-width', String(this.activePathWidth));
    this.activePath.setAttribute('stroke-linecap', 'round');
    this.activePath.setAttribute('stroke-linejoin', 'round');
    this.activePath.setAttribute('d', `M ${x} ${y}`);

    this.contentGroup().nativeElement.appendChild(this.activePath);
  }

  private continueDraw(event: PointerEvent): void {
    if (!this.isDrawing || !this.activePath) return;

    const { x, y } = this.screenToWorld(event.clientX, event.clientY);
    const d = this.activePath.getAttribute('d') + ` L ${x} ${y}`;
    this.activePath.setAttribute('d', d);
  }

  private endDraw(): void {
    if (this.isDrawing && this.activePath) {
      const pathData = this.activePath.getAttribute('d') || '';

      // Store the path in our signal for persistence
      const newPath: Path = {
        id: this.generateId(),
        d: pathData,
        color: this.activePathColor,
        width: this.activePathWidth,
      };

      // Keep the DOM element - Angular will render a duplicate but that's OK
      // We'll clean up by setting a data-id on it
      this.activePath.setAttribute('data-id', newPath.id);

      this.paths.update((paths) => [...paths, newPath]);
    }

    this.isDrawing = false;
    this.activePath = null;
    this.activePathColor = '';
    this.activePathWidth = 0;
  }

  private cancelDraw(): void {
    // Remove the path from DOM without saving (used when switching to pinch/pan)
    if (this.activePath) {
      this.activePath.remove();
    }
    this.isDrawing = false;
    this.activePath = null;
    this.activePathColor = '';
    this.activePathWidth = 0;
  }

  // Panning
  private startPan(event: PointerEvent): void {
    this.isPanning = true;
    this.panPointerId = event.pointerId;
    this.panAnchorWorld = this.screenToWorld(event.clientX, event.clientY);
  }

  private continuePan(event: PointerEvent): void {
    if (!this.isPanning || event.pointerId !== this.panPointerId || !this.panAnchorWorld) return;

    const screen = this.screenToLocalCanvas(event.clientX, event.clientY);
    this.tx.set(screen.x - this.scale() * this.panAnchorWorld.x);
    this.ty.set(screen.y - this.scale() * this.panAnchorWorld.y);
  }

  private endPan(event: PointerEvent): void {
    if (event.pointerId !== this.panPointerId) return;

    this.isPanning = false;
    this.panPointerId = null;
    this.panAnchorWorld = null;
  }

  // Pinch zoom
  private startPinch(): void {
    const ids = Array.from(this.pointers.keys());
    if (ids.length !== 2) return;

    this.pinchActive = true;
    const p0 = this.pointers.get(ids[0])!;
    const p1 = this.pointers.get(ids[1])!;
    const centroid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };

    this.pinchInitialDist = this.dist2D(p0, p1);
    this.pinchInitialScale = this.scale();
    this.pinchAnchorWorld = this.screenToWorld(centroid.x, centroid.y);
  }

  private updatePinch(): void {
    const ids = Array.from(this.pointers.keys());
    if (ids.length !== 2 || !this.pinchActive || !this.pinchAnchorWorld) return;

    const p0 = this.pointers.get(ids[0])!;
    const p1 = this.pointers.get(ids[1])!;
    const currDist = this.dist2D(p0, p1);

    let newScale = this.pinchInitialScale * (currDist / this.pinchInitialDist);
    newScale = this.clampScale(newScale);

    // Get current centroid in canvas coordinates (follows finger movement)
    const currentCentroid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const currentCentroidCanvas = this.screenToLocalCanvas(currentCentroid.x, currentCentroid.y);

    // Keep pinchAnchorWorld mapped to the CURRENT centroid position
    this.tx.set(currentCentroidCanvas.x - newScale * this.pinchAnchorWorld.x);
    this.ty.set(currentCentroidCanvas.y - newScale * this.pinchAnchorWorld.y);
    this.scale.set(newScale);
  }

  private endPinch(): void {
    this.pinchActive = false;
    this.pinchAnchorWorld = null;
  }

  // Eraser using elementFromPoint
  private startErase(event: PointerEvent): void {
    this.erasePrevScreen = { x: event.clientX, y: event.clientY };
    this.eraseAtPoint(event.clientX, event.clientY);
  }

  private continueErase(event: PointerEvent): void {
    const curr = { x: event.clientX, y: event.clientY };

    if (!this.erasePrevScreen) {
      this.erasePrevScreen = curr;
      return;
    }

    const samples = this.sampleSegmentPoints(this.erasePrevScreen, curr, 8);
    const toDelete = new Set<string>();

    for (const pt of samples) {
      const el = document.elementFromPoint(pt.x, pt.y);
      if (!el) continue;

      const id = el.getAttribute?.('data-id');
      if (id && el.closest?.('#contentGroup')) {
        toDelete.add(id);
      }
    }

    if (toDelete.size > 0) {
      this.paths.update((paths) => paths.filter((p) => !toDelete.has(p.id)));

      // Also remove from DOM (for paths not yet in signal)
      toDelete.forEach((id) => {
        const el = this.contentGroup().nativeElement.querySelector(`[data-id="${id}"]`);
        el?.remove();
      });
    }

    this.erasePrevScreen = curr;
  }

  private eraseAtPoint(x: number, y: number): void {
    const el = document.elementFromPoint(x, y);
    if (!el) return;

    const id = el.getAttribute?.('data-id');
    if (id && el.closest?.('#contentGroup')) {
      this.paths.update((paths) => paths.filter((p) => p.id !== id));
      el.remove();
    }
  }

  private endErase(): void {
    this.erasePrevScreen = null;
  }

  // File operations
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const root = doc.documentElement;

      // Clear current content
      const contentEl = this.contentGroup().nativeElement;
      while (contentEl.firstChild) {
        contentEl.removeChild(contentEl.firstChild);
      }

      // Reset transform before importing
      this.tx.set(0);
      this.ty.set(0);
      this.scale.set(1);

      // Find paths - they might be directly under root or inside a <g> wrapper
      const importPaths = (parent: Element) => {
        for (const child of Array.from(parent.childNodes)) {
          if (child.nodeType !== 1) continue;
          const el = child as Element;
          const name = el.tagName.toLowerCase();

          // Skip non-visual elements
          if (['style', 'script', 'title', 'desc', 'defs'].includes(name)) continue;

          // If it's a group, recurse into it
          if (name === 'g') {
            importPaths(el);
            continue;
          }

          // Import the element
          const adopted = document.importNode(el, true) as Element;
          const id = this.generateId();
          adopted.setAttribute('data-id', id);

          // Ensure path has fill none
          if (name === 'path') {
            adopted.setAttribute('fill', 'none');
          }

          contentEl.appendChild(adopted);
        }
      };

      importPaths(root);

      // Fit loaded content to view
      this.fitToView();
    } catch (err) {
      console.error(err);
      alert('Failed to parse SVG file.');
    } finally {
      // Reset input so same file can be selected again
      input.value = '';
    }
  }

  private fitToView(): void {
    // Read paths directly from DOM
    const contentEl = this.contentGroup().nativeElement;
    const pathElements = contentEl.querySelectorAll('path');

    if (pathElements.length === 0) {
      // Reset to defaults
      this.tx.set(0);
      this.ty.set(0);
      this.scale.set(1);
      return;
    }

    // Calculate bounding box of all paths
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    pathElements.forEach((pathEl) => {
      const d = pathEl.getAttribute('d') || '';
      const coords = d.match(/[\d.-]+/g);
      if (coords) {
        for (let i = 0; i < coords.length; i += 2) {
          const x = parseFloat(coords[i]);
          const y = parseFloat(coords[i + 1]);
          if (!isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
    });

    if (!isFinite(minX)) {
      this.tx.set(0);
      this.ty.set(0);
      this.scale.set(1);
      return;
    }

    const padding = 50;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    const rect = this.getBoardRect();
    const viewWidth = rect.width;
    const viewHeight = rect.height;

    // Calculate scale to fit content
    const scaleX = viewWidth / contentWidth;
    const scaleY = viewHeight / contentHeight;
    const newScale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1:1

    // Center the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.scale.set(newScale);
    this.tx.set(viewWidth / 2 - centerX * newScale);
    this.ty.set(viewHeight / 2 - centerY * newScale);
  }

  saveSVG(): void {
    // Get all paths from DOM
    const contentEl = this.contentGroup().nativeElement;
    const pathElements = contentEl.querySelectorAll('path');

    if (pathElements.length === 0) {
      alert('Nothing to save');
      return;
    }

    // Calculate bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    pathElements.forEach((pathEl) => {
      const d = pathEl.getAttribute('d') || '';
      const coords = d.match(/[\d.-]+/g);
      if (coords) {
        for (let i = 0; i < coords.length; i += 2) {
          const x = parseFloat(coords[i]);
          const y = parseFloat(coords[i + 1]);
          if (!isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
    });

    // Add padding
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    // Serialize paths
    const serializedContent = Array.from(pathElements)
      .map((node) => new XMLSerializer().serializeToString(node))
      .join('\n');

    const style = `
  <style>
    html, body { height: 100%; margin: 0; background: #fff; }
    svg { width: 100vw; height: 100vh; display: block; background: #fff; }
    path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  </style>`;

    // Use viewBox to make SVG fit to window when opened in browser
    const svgOut = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet">
${style}
<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/>
${serializedContent}
</svg>`;

    const blob = new Blob([svgOut], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `whiteboard-${stamp}.svg`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  setMode(mode: DrawMode): void {
    this.mode.set(mode);
  }

  clearCanvas(): void {
    this.paths.set([]);

    // Clear DOM
    const contentEl = this.contentGroup().nativeElement;
    while (contentEl.firstChild) {
      contentEl.removeChild(contentEl.firstChild);
    }

    // Reset transform
    this.tx.set(0);
    this.ty.set(0);
    this.scale.set(1);
  }
}

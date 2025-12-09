# Whiteboard2 Component Specification

Create an Angular standalone component for an infinite SVG whiteboard with drawing, panning, zooming, and erasing capabilities.

## Component Structure

Create 3 files:
- `src/app/whiteboard2/whiteboard2.component.ts`
- `src/app/whiteboard2/whiteboard2.component.html`
- `src/app/whiteboard2/whiteboard2.component.scss`

## Technical Requirements

### Angular Setup
- Standalone component (no `standalone: true` needed - it's default)
- Use `ChangeDetectionStrategy.OnPush`
- Import `CommonModule` and `FormsModule`
- Use `viewChild.required` for element references
- Use signals for reactive state
- Use `host` property in decorator for window resize listener

### Architecture: Transform-Based Rendering

Use CSS transform on a `<g>` element instead of SVG viewBox manipulation:
- `transform = translate(tx, ty) scale(scale)`
- World coordinates are transformed to screen: `screen = translate + scale * world`
- Screen to world conversion: `world = (screen - translate) / scale`

This approach is simpler and performs better than viewBox manipulation.

### State Management (Signals)

```typescript
// Public signals
paths = signal<Path[]>([]);           // For persistence (not used for rendering)
currentColor = signal('#0c62f0');     // Stroke color
strokeWidth = signal(6);               // Stroke width (1-40)
mode = signal<DrawMode>('draw');       // 'draw' | 'pan' | 'erase'

// Transform signals (private)
scale = signal(1);                     // Zoom level (0.05 - 20)
tx = signal(0);                        // X translation
ty = signal(0);                        // Y translation

// Computed signals
transform = computed(() => `translate(${tx()},${ty()}) scale(${scale()})`);
status = computed(() => `scale=${scale().toFixed(3)} tx=${tx().toFixed(1)} ty=${ty().toFixed(1)} | mode=${mode()}`);
```

### Drawing Implementation

**CRITICAL: Use direct DOM manipulation for drawing performance.**

Do NOT use Angular signals/templates for real-time drawing - it's too slow with OnPush.

```typescript
private startDraw(event: PointerEvent): void {
  // Create path element directly
  this.activePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  this.activePath.setAttribute('fill', 'none');
  this.activePath.setAttribute('stroke', this.currentColor());
  this.activePath.setAttribute('stroke-width', String(this.strokeWidth()));
  this.activePath.setAttribute('stroke-linecap', 'round');
  this.activePath.setAttribute('stroke-linejoin', 'round');
  this.activePath.setAttribute('d', `M ${x} ${y}`);
  this.contentGroup().nativeElement.appendChild(this.activePath);
}

private continueDraw(event: PointerEvent): void {
  // Append to path 'd' attribute directly
  const d = this.activePath.getAttribute('d') + ` L ${x} ${y}`;
  this.activePath.setAttribute('d', d);
}

private endDraw(): void {
  // Set data-id for eraser functionality
  this.activePath.setAttribute('data-id', newPath.id);
  // Optionally store in paths signal for persistence
  this.paths.update(paths => [...paths, newPath]);
}
```

### Panning Implementation

Keep the world anchor point fixed under the pointer:

```typescript
private startPan(event: PointerEvent): void {
  this.panAnchorWorld = this.screenToWorld(event.clientX, event.clientY);
}

private continuePan(event: PointerEvent): void {
  const screen = this.screenToLocalCanvas(event.clientX, event.clientY);
  this.tx.set(screen.x - this.scale() * this.panAnchorWorld.x);
  this.ty.set(screen.y - this.scale() * this.panAnchorWorld.y);
}
```

### Zoom Implementation

#### Mouse Wheel Zoom
Zoom at cursor position with smooth exponential factor:

```typescript
onWheel(event: WheelEvent): void {
  event.preventDefault();
  const factor = Math.pow(1.0015, -event.deltaY);  // Smooth zoom
  const anchorWorld = this.screenToWorld(event.clientX, event.clientY);
  const anchorCanvas = this.screenToLocalCanvas(event.clientX, event.clientY);
  const newScale = this.clampScale(this.scale() * factor);

  this.tx.set(anchorCanvas.x - newScale * anchorWorld.x);
  this.ty.set(anchorCanvas.y - newScale * anchorWorld.y);
  this.scale.set(newScale);
}
```

#### Pinch Zoom (Touch)
Freeze anchor point at pinch center:

```typescript
private startPinch(): void {
  // Store initial distance, scale, and anchor points
  this.pinchInitialDist = this.dist2D(p0, p1);
  this.pinchInitialScale = this.scale();
  this.pinchAnchorScreen = this.screenToLocalCanvas(centroid.x, centroid.y);
  this.pinchAnchorWorld = this.screenToWorld(centroid.x, centroid.y);
}

private updatePinch(): void {
  const newScale = this.pinchInitialScale * (currDist / this.pinchInitialDist);
  // Keep world anchor mapped to initial screen anchor
  this.tx.set(this.pinchAnchorScreen.x - newScale * this.pinchAnchorWorld.x);
  this.ty.set(this.pinchAnchorScreen.y - newScale * this.pinchAnchorWorld.y);
  this.scale.set(newScale);
}
```

### Eraser Implementation

Use `document.elementFromPoint()` with segment sampling:

```typescript
private continueErase(event: PointerEvent): void {
  // Sample points along the movement segment
  const samples = this.sampleSegmentPoints(this.erasePrevScreen, curr, 8);

  for (const pt of samples) {
    const el = document.elementFromPoint(pt.x, pt.y);
    if (el?.getAttribute?.('data-id') && el.closest?.('#contentGroup')) {
      el.remove();  // Remove from DOM
    }
  }
}
```

### Pointer Event Handling

Use pointer events with capture for reliable tracking:

```typescript
onPointerDown(event: PointerEvent): void {
  svg.setPointerCapture(event.pointerId);
  this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  // Handle 2-finger pinch
  if (this.pointers.size === 2 && this.mode() !== 'erase') {
    this.startPinch();
    return;
  }

  // Dispatch to mode handler
  if (this.mode() === 'draw') this.startDraw(event);
  else if (this.mode() === 'pan') this.startPan(event);
  else if (this.mode() === 'erase') this.startErase(event);
}

onPointerUp(event: PointerEvent): void {
  this.pointers.delete(event.pointerId);
  svg.releasePointerCapture(event.pointerId);
  // ... end handlers
}
```

### File Operations

#### Open SVG
- Parse with DOMParser
- Recursively import paths from `<g>` wrappers (flatten structure)
- Reset transform to defaults before import
- Call `fitToView()` after import
- Set `fill="none"` on imported paths

```typescript
const importPaths = (parent: Element) => {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const name = el.tagName.toLowerCase();

    if (['style', 'script', 'title', 'desc', 'defs'].includes(name)) continue;
    if (name === 'g') { importPaths(el); continue; }

    const adopted = document.importNode(el, true);
    adopted.setAttribute('data-id', this.generateId());
    if (name === 'path') adopted.setAttribute('fill', 'none');
    contentEl.appendChild(adopted);
  }
};
```

#### Save SVG
- Calculate bounding box of all paths
- Use `viewBox` with `preserveAspectRatio="xMidYMid meet"` for browser display
- Add white background rect
- Serialize paths with XMLSerializer

```typescript
const svgOut = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet">
  <style>
    html, body { height: 100%; margin: 0; background: #fff; }
    svg { width: 100vw; height: 100vh; display: block; background: #fff; }
    path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  </style>
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/>
  ${serializedContent}
</svg>`;
```

### Fit To View

Calculate bounding box and adjust transform to center and fit content:

```typescript
private fitToView(): void {
  // Calculate bounding box from DOM paths
  // Add padding (50px)
  // Calculate scale to fit (don't zoom beyond 1:1)
  const scaleX = viewWidth / contentWidth;
  const scaleY = viewHeight / contentHeight;
  const newScale = Math.min(scaleX, scaleY, 1);

  // Center content
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  this.scale.set(newScale);
  this.tx.set(viewWidth / 2 - centerX * newScale);
  this.ty.set(viewHeight / 2 - centerY * newScale);
}
```

### Clear Canvas

```typescript
clearCanvas(): void {
  // Clear DOM
  while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);
  // Reset transform
  this.tx.set(0);
  this.ty.set(0);
  this.scale.set(1);
}
```

## Template Structure

```html
<div class="whiteboard-container" [attr.data-mode]="mode()">
  <!-- Toolbar -->
  <div class="toolbar">
    <!-- File operations: Open SVG (label+hidden input), Save SVG button -->
    <!-- Color picker input -->
    <!-- Width slider (1-40) with value display -->
    <!-- Mode radio buttons: Draw, Pan, Erase -->
    <!-- Clear button -->
    <!-- Status display -->
  </div>

  <!-- SVG Canvas -->
  <div class="board-wrapper">
    <svg
      #svgCanvas
      class="svg-canvas"
      [style.cursor]="cursor()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerCancel($event)"
      (pointerleave)="onPointerUp($event)"
      (wheel)="onWheel($event)"
    >
      <!-- Hit area OUTSIDE transform group for event capture -->
      <rect class="hit-area" x="0" y="0" width="100%" height="100%" fill="white"></rect>

      <!-- Content group with transform -->
      <g #contentGroup id="contentGroup" [attr.transform]="transform()">
        <!-- Paths are added here via DOM manipulation -->
      </g>
    </svg>
  </div>
</div>
```

## Styles (SCSS)

```scss
:host {
  display: block;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.whiteboard-container {
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100vh;
  background: #f7f7f7;
  font-family: system-ui, -apple-system, sans-serif;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid #ddd;
  flex-wrap: wrap;
  user-select: none;
}

.board-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
}

.svg-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;  /* Required for pointer events */
  background: #fff;
}

.hit-area {
  fill: white;
}

/* Cursor styles based on mode via data-mode attribute */
.whiteboard-container[data-mode='pan'] .svg-canvas {
  cursor: grab;
  &:active { cursor: grabbing; }
}

.whiteboard-container[data-mode='erase'] .svg-canvas,
.whiteboard-container[data-mode='draw'] .svg-canvas {
  cursor: crosshair;
}
```

## Key Implementation Notes

1. **DOM is source of truth** - Paths live in the DOM, not in Angular signals
2. **No Angular rendering for paths** - Direct DOM manipulation only
3. **Hit area outside transform** - Ensures events are captured at any zoom/pan
4. **Pointer capture** - Use `setPointerCapture` for reliable drag tracking
5. **Color/width captured at draw start** - Store values when stroke begins
6. **data-id attribute** - Required on paths for eraser functionality
7. **Coordinate conversion** - Always convert between screen and world coordinates
8. **Scale limits** - MIN_SCALE=0.05, MAX_SCALE=20
9. **Smooth wheel zoom** - Use `Math.pow(1.0015, -deltaY)` factor
10. **Pinch anchor freeze** - Store initial screen position, keep world point mapped to it

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <div class="home-container">
      <h1>Whiteboard App</h1>
      <nav class="nav-links">
        <a routerLink="/whiteboard" class="nav-link">
          <span class="icon">1</span>
          <span class="label">Whiteboard (Original)</span>
          <span class="description">ViewBox-based implementation</span>
        </a>
        <a routerLink="/whiteboard2" class="nav-link">
          <span class="icon">2</span>
          <span class="label">Whiteboard 2 (Improved)</span>
          <span class="description">Transform-based with all improvements</span>
        </a>
        <a routerLink="/whiteboard3" class="nav-link">
          <span class="icon">3</span>
          <span class="label">Whiteboard 3 (better)</span>
          <span class="description">Transform-based with 2 finger pan/pinch</span>
        </a>
        <a routerLink="/whiteboard4" class="nav-link">
          <span class="icon">4</span>
          <span class="label">Whiteboard 4 (betterer)</span>
          <span class="description">Transform-based with 2 finger pan/pinch, external controls</span>
        </a>
      </nav>
    </div>
  `,
  styles: `
    .home-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f7f7f7;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 20px;
    }

    h1 {
      font-size: 2rem;
      color: #333;
      margin-bottom: 2rem;
    }

    .nav-links {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      width: 100%;
      max-width: 400px;
    }

    .nav-link {
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease;

      &:hover {
        border-color: #0c62f0;
        box-shadow: 0 4px 12px rgba(12, 98, 240, 0.15);
        transform: translateY(-2px);
      }
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: #0c62f0;
      color: white;
      border-radius: 50%;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }

    .label {
      font-size: 1.125rem;
      font-weight: 600;
      color: #333;
    }

    .description {
      font-size: 0.875rem;
      color: #666;
      margin-top: 0.25rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {}

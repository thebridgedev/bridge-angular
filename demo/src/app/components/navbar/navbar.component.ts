import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, LoginComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, LoginComponent],
  template: `
    <nav class="nav-menu">
      <div class="nav-container">
        <a routerLink="/" class="nav-brand">Bridge Demo</a>

        @if (isAuthenticated()) {
          <div class="nav-links">
            <a routerLink="/" class="nav-link" style="margin-right: auto">Home</a>
            <a routerLink="/team" class="nav-link">Team Management</a>
            <a routerLink="/team-panel" class="nav-link">Team Panel</a>
            <a routerLink="/workspaces" class="nav-link">Workspaces</a>
            <a routerLink="/protected" class="nav-link">Protected Page</a>
            <button class="nav-button" (click)="logout()">Logout</button>
          </div>
        } @else {
          <div class="nav-links">
            <a routerLink="/auth/login" class="nav-link">Sign in</a>
            <a routerLink="/auth/signup" class="nav-link">Sign up</a>
            <bridge-login />
            <a routerLink="/protected" class="nav-link">Protected Page</a>
          </div>
        }
      </div>
    </nav>
  `,
})
export class NavbarComponent {
  protected readonly isAuthenticated = this.authService.isAuthenticated;

  constructor(private authService: AuthService) {}

  logout(): void {
    this.authService.logout();
  }
}

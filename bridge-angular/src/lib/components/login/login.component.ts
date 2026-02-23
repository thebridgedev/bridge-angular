import { Component } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'bridge-login',
  standalone: true,
  template: `
    <button class="login-button" (click)="login()">
      Login with Bridge
    </button>
  `,
  styles: [`
    .login-button {
      display: inline-block;
      padding: 0.5rem 1rem;
      background-color: #3b82f6;
      color: white;
      border-radius: 0.25rem;
      border: none;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background-color 0.2s;
    }

    .login-button:hover {
      background-color: #2563eb;
    }
  `],
})
export class LoginComponent {
  constructor(private authService: AuthService) {}

  login(): void {
    this.authService.login();
  }
}

import { Component } from '@angular/core';
import { AuthService, ProfileService } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-protected',
  standalone: true,
  template: `
    <div class="container">
      <h1>Protected Page</h1>

      @if (isAuthenticated()) {
        <div class="content">
          <p class="message">
            This is a protected page. You can only see this content when you're logged in.
          </p>

          <div class="info-card">
            <h2>Authentication Status</h2>
            <p>You are currently authenticated</p>

            <h2>Your Profile</h2>
            @if (profile()) {
              <p><strong>Name:</strong> {{ profile()?.fullName }}</p>
              <p><strong>Email:</strong> {{ profile()?.email }}</p>
              <p><strong>Username:</strong> {{ profile()?.username }}</p>
              @if (profile()?.tenant) {
                <div style="margin-top: 1rem;">
                  <h3>Tenant Information</h3>
                  <p><strong>Tenant Name:</strong> {{ profile()?.tenant?.name }}</p>
                  <p><strong>Tenant ID:</strong> {{ profile()?.tenant?.id }}</p>
                </div>
              }
            } @else {
              <p>Loading profile...</p>
            }
          </div>
        </div>
      } @else {
        <p class="message">Please log in to view this content.</p>
      }
    </div>
  `,
  styles: [`
    .container { text-align: center; }
    h1 { font-size: 2.5rem; color: #1f2937; margin-bottom: 2rem; }
    .content { max-width: 600px; margin: 0 auto; }
    .message { font-size: 1.25rem; color: #4b5563; margin-bottom: 2rem; }
  `],
})
export class ProtectedComponent {
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly profile = this.profileService.profile;

  constructor(
    private authService: AuthService,
    private profileService: ProfileService,
  ) {}
}

/**
 * TeamProfileForm — Angular port of bridge-svelte's `team/TeamProfileForm.svelte`
 * (and react's `TeamProfileForm.tsx`).
 *
 * The Profile tab: shows the current user's email (read-only) plus editable
 * first/last name. Loads via auth-core `getBridgeAuth().team.getProfile()` and
 * saves via `updateProfile({ firstName, lastName })`.
 *
 * Reactive translation (§5.1): svelte `$state` → signals; `onMount` load →
 * `ngOnInit`.
 */
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TeamProfile } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthAlertComponent } from '../sdk-auth/shared/alert.component';
import { AuthSpinnerComponent } from '../sdk-auth/shared/spinner.component';

@Component({
  selector: 'bridge-team-profile-form',
  standalone: true,
  imports: [FormsModule, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <div [class]="className" [style]="style" data-bridge-team-profile>
      <h3 class="bridge-team-section-title">My Profile</h3>

      @if (loading()) {
        <div class="bridge-team-loading">
          <bridge-auth-spinner [size]="32" />
          <span>Loading profile...</span>
        </div>
      } @else {
        @if (loadError()) {
          <div class="bridge-team-alert">
            <bridge-auth-alert variant="error">{{ loadError() }}</bridge-auth-alert>
          </div>
        }
        @if (success()) {
          <div class="bridge-team-alert">
            <bridge-auth-alert variant="success">{{ success() }}</bridge-auth-alert>
          </div>
        }

        <form class="bridge-team-form" (ngSubmit)="submit()">
          <div class="bridge-team-form-group">
            <label for="bridge-profile-email">Email</label>
            <input id="bridge-profile-email" type="email" [value]="profile()?.email ?? ''" disabled readonly />
          </div>

          <div class="bridge-team-form-row">
            <div class="bridge-team-form-group">
              <label for="bridge-profile-first-name">First Name</label>
              <input
                id="bridge-profile-first-name"
                type="text"
                [(ngModel)]="firstName"
                name="firstName"
                [disabled]="saving()"
              />
            </div>

            <div class="bridge-team-form-group">
              <label for="bridge-profile-last-name">Last Name</label>
              <input
                id="bridge-profile-last-name"
                type="text"
                [(ngModel)]="lastName"
                name="lastName"
                [disabled]="saving()"
              />
            </div>
          </div>

          @if (profile()?.role) {
            <div class="bridge-team-form-group">
              <label>Role</label>
              <div class="bridge-team-readonly">{{ profile()?.role }}</div>
            </div>
          }

          <div class="bridge-team-form-actions">
            <button type="submit" class="bridge-btn bridge-btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class TeamProfileFormComponent implements OnInit {
  @Input() className = '';
  @Input() style = '';
  @Output() error = new EventEmitter<Error>();

  protected readonly profile = signal<TeamProfile | null>(null);
  protected firstName = '';
  protected lastName = '';
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  private readonly authService = inject(AuthService);

  async ngOnInit(): Promise<void> {
    try {
      const bridge = this.authService.getBridgeAuth();
      const p = await bridge.team.getProfile();
      this.profile.set(p);
      this.firstName = p.firstName ?? '';
      this.lastName = p.lastName ?? '';
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load profile');
      this.loadError.set(e.message);
      this.error.emit(e);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.saving.set(true);
    this.loadError.set(null);
    this.success.set(null);
    try {
      const bridge = this.authService.getBridgeAuth();
      const updated = await bridge.team.updateProfile({
        firstName: this.firstName,
        lastName: this.lastName,
      });
      this.profile.set(updated);
      this.success.set('Profile updated successfully.');
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update profile');
      this.loadError.set(e.message);
      this.error.emit(e);
    } finally {
      this.saving.set(false);
    }
  }
}

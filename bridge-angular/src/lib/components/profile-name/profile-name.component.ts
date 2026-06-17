/**
 * Angular port of bridge-svelte's `ProfileName.svelte`.
 *
 * Displays the current user's full name (or email fallback) when authenticated;
 * renders nothing when no profile is loaded. The data source is the BridgeAuth-
 * backed profile signal (`AuthService.profile`) — it updates automatically when
 * `auth:profile` fires.
 */
import { Component, Input, computed } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'bridge-profile-name',
  standalone: true,
  template: `
    @if (displayName()) {
      <span [class]="className" [style]="style" data-bridge-profile-name>{{ displayName() }}</span>
    }
  `,
})
export class ProfileNameComponent {
  @Input() className = '';
  @Input() style = '';

  protected readonly displayName = computed(() => {
    const p = this.authService.profile();
    return p?.fullName || p?.email || '';
  });

  constructor(private authService: AuthService) {}
}

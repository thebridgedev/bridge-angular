/**
 * Alert — Angular port of bridge-svelte's `sdk-auth/shared/Alert.svelte`.
 *
 * Renders an inline status banner used across the sdk-auth components. Mirrors
 * react's `shared/Alert.tsx`: a `data-bridge-alert` div with a `data-variant`
 * attribute that the shipped `styles.css` themes. Renders nothing when empty.
 */
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bridge-auth-alert',
  standalone: true,
  template: `
    <div
      [class]="className"
      [style]="style"
      [attr.data-variant]="variant"
      data-bridge-alert
      role="alert"
    >
      <ng-content></ng-content>
    </div>
  `,
})
export class AuthAlertComponent {
  @Input() variant: 'error' | 'info' | 'success' = 'error';
  @Input() className = '';
  @Input() style = '';
}

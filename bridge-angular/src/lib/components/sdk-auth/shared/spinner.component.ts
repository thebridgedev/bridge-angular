/**
 * Spinner — Angular port of bridge-svelte's `sdk-auth/shared/Spinner.svelte`.
 *
 * A sized, CSS-animated `data-bridge-spinner` span (theming lives in the shipped
 * `styles.css`). Mirrors react's `shared/Spinner.tsx`.
 */
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bridge-auth-spinner',
  standalone: true,
  template: `
    <span
      [class]="className"
      [style.width.px]="size"
      [style.height.px]="size"
      [style]="style"
      data-bridge-spinner
    ></span>
  `,
})
export class AuthSpinnerComponent {
  @Input() size = 24;
  @Input() className = '';
  @Input() style = '';
}

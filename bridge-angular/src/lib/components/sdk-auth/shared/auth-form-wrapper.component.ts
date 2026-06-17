/**
 * AuthFormWrapper — Angular port of bridge-svelte's
 * `sdk-auth/shared/AuthFormWrapper.svelte`.
 *
 * Card shell shared by every sdk-auth form. Mirrors react's
 * `shared/AuthFormWrapper.tsx`: a `data-bridge-auth-form` container that renders
 * a `heading` (or a projected `[heading]` slot via `<ng-content>`), then the
 * projected body.
 */
import { Component, Input } from '@angular/core';

@Component({
  selector: 'bridge-auth-form-wrapper',
  standalone: true,
  template: `
    <div [class]="className" [style]="style" data-bridge-auth-form>
      <ng-content select="[heading]"></ng-content>
      @if (heading) {
        <h2 class="bridge-auth-heading">{{ heading }}</h2>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class AuthFormWrapperComponent {
  @Input() heading = '';
  @Input() className = '';
  @Input() style = '';
}

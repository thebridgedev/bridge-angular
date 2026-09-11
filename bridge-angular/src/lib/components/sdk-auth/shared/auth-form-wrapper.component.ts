/**
 * AuthFormWrapper — Angular port of bridge-svelte's
 * `sdk-auth/shared/AuthFormWrapper.svelte`.
 *
 * Card shell shared by every sdk-auth form. Mirrors react's
 * `shared/AuthFormWrapper.tsx`: a `data-bridge-auth-form` container that renders
 * a `heading` (or a projected `[heading]` slot via `<ng-content>`), then an
 * optional step description, then the projected body.
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
      <ng-content select="[description]"></ng-content>
      @if (description) {
        <p class="bridge-step-desc">{{ description }}</p>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class AuthFormWrapperComponent {
  /** Heading text. Pass `null` or `''` to render no heading. */
  @Input() heading: string | null = '';

  /**
   * Step description, the `<p class="bridge-step-desc">` under the heading.
   * Pass `null` or `''` to render nothing at all — no empty paragraph holding
   * vertical space (TBP-631).
   *
   * Independent of `heading`: suppressing one never affects the other. An app
   * that writes its own page title and subtitle suppresses both; an app that
   * writes only the title suppresses only the heading.
   *
   * Before TBP-631 these lived in each component's template, outside this
   * wrapper's heading guard, so `[heading]="null"` could not reach them and a
   * host page ended up printing its own subtitle followed by Bridge's — the same
   * sentence twice, in two voices.
   *
   * For copy that carries markup, project a `[description]` element instead —
   * `signup-form` needs `<strong>{{ email }}</strong>` inside its sentence,
   * which a plain string input cannot express.
   */
  @Input() description: string | null = '';

  @Input() className = '';
  @Input() style = '';
}

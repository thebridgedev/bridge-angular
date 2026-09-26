import { Component } from '@angular/core';
import { SignupFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-signup',
  standalone: true,
  imports: [SignupFormComponent],
  template: `
    <div style="padding: 2rem; max-width: 480px; margin: 0 auto;">
      <!-- Stay on the page after a successful signup: SignupFormComponent swaps
           to its "Check your email" confirmation, which is the SDK behaviour
           the signup specs assert. Navigating to /auth/login here unmounted it
           the instant it rendered (TBP-721). bridge-svelte's demo only logs. -->
      <bridge-signup-form
        (signup)="onSignup()"
        (error)="onError($event)"
      />
    </div>
  `,
})
export class SdkSignupComponent {
  protected onSignup(): void {
    console.log('[SDK Signup] Account created');
  }

  protected onError(err: unknown): void {
    console.error('[SDK Signup]', err);
  }
}

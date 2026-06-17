import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SignupFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-signup',
  standalone: true,
  imports: [SignupFormComponent],
  template: `
    <div style="padding: 2rem; max-width: 480px; margin: 0 auto;">
      <bridge-signup-form (signup)="router.navigateByUrl('/auth/login')" />
    </div>
  `,
})
export class SdkSignupComponent {
  protected readonly router = inject(Router);
}

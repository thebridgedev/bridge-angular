import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoginFormComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-login',
  standalone: true,
  imports: [LoginFormComponent],
  template: `
    <div style="padding: 2rem; max-width: 480px; margin: 0 auto;">
      <bridge-login-form
        heading="Sign in"
        [showMagicLink]="true"
        [showPasskeys]="true"
        (login)="router.navigateByUrl('/')"
      />
    </div>
  `,
})
export class SdkLoginComponent {
  protected readonly router = inject(Router);
}

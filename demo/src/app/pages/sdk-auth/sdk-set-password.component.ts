import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ForgotPasswordComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-set-password',
  standalone: true,
  imports: [ForgotPasswordComponent],
  template: `
    <div style="padding: 2rem; max-width: 480px; margin: 0 auto;">
      <bridge-forgot-password [token]="token" />
    </div>
  `,
})
export class SdkSetPasswordComponent {
  protected readonly token =
    inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
}

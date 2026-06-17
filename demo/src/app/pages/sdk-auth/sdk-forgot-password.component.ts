import { Component } from '@angular/core';
import { ForgotPasswordComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-forgot-password',
  standalone: true,
  imports: [ForgotPasswordComponent],
  template: `
    <div style="padding: 2rem; max-width: 480px; margin: 0 auto;">
      <bridge-forgot-password />
    </div>
  `,
})
export class SdkForgotPasswordComponent {}

import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PasskeySetupComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-setup-passkey',
  standalone: true,
  imports: [PasskeySetupComponent],
  template: `
    <div style="padding: 2rem; max-width: 480px; margin: 0 auto;">
      <bridge-passkey-setup [token]="token" />
    </div>
  `,
})
export class SdkSetupPasskeyComponent {
  protected readonly token =
    inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
}

import { Component } from '@angular/core';
import { MagicLinkComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-sdk-magic-link',
  standalone: true,
  imports: [MagicLinkComponent],
  template: `
    <div style="padding: 2rem; max-width: 480px; margin: 0 auto;">
      <bridge-magic-link />
    </div>
  `,
})
export class SdkMagicLinkComponent {}

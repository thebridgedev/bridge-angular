import { Component } from '@angular/core';
import { ApiTokenManagementComponent } from '@nebulr-group/bridge-angular';

/** Developer API tokens demo page (parity with svelte's ApiTokenManagement usage). */
@Component({
  selector: 'app-api-tokens',
  standalone: true,
  imports: [ApiTokenManagementComponent],
  template: `
    <div class="container content">
      <bridge-api-token-management class="card" />
    </div>
  `,
})
export class ApiTokensComponent {}

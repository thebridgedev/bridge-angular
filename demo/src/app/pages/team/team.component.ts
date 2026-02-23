import { Component } from '@angular/core';
import { TeamManagementComponent } from '@nebulr-group/bridge-angular';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [TeamManagementComponent],
  template: `
    <div class="team-page">
      <h1>Team Management</h1>
      <bridge-team-management />
    </div>
  `,
  styles: [`
    .team-page { padding: 2rem; }
    h1 { margin-bottom: 2rem; color: #1f2937; }
  `],
})
export class TeamComponent {}

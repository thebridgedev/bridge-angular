import { Component } from '@angular/core';
import { FeatureFlagComponent } from '@nebulr-group/bridge-angular';
import { ConfigStatusComponent } from '../../components/config-status/config-status.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FeatureFlagComponent, ConfigStatusComponent],
  template: `
    <div class="page-container">
      <div class="container">
        <div class="content">
          <div class="hero">
            <h1 class="heading-xl">Welcome to Bridge Angular Demo</h1>
            <p class="text-lead">
              This demo showcases the integration of Bridge features in an Angular application.
            </p>
          </div>

          <app-config-status />

          <div class="features-overview">
            <h2 class="heading-lg">The code demonstrates the following features</h2>
            <div class="features-grid">
              <div class="feature-group">
                <h3 class="heading-md">🚦 Feature Flags</h3>
                <ul>
                  <li>Basic feature flag usage</li>
                  <li>Negation support for inverse conditions</li>
                  <li>Cached vs live flag checks</li>
                  <li>Route protection with flags</li>
                </ul>
              </div>

              <div class="feature-group">
                <h3 class="heading-md">👥 Team Management</h3>
                <ul>
                  <li>Team members overview</li>
                  <li>Role management</li>
                  <li>Invite system</li>
                  <li>Permissions handling</li>
                </ul>
              </div>

              <div class="feature-group">
                <h3 class="heading-md">🔐 Authentication</h3>
                <ul>
                  <li>Login & logout flow</li>
                  <li>Protected routes</li>
                  <li>Automatic token renewal</li>
                  <li>Profile information</li>
                </ul>
              </div>

              <div class="feature-group">
                <h3 class="heading-md">🛠️ Integration Examples</h3>
                <ul>
                  <li>Conditional rendering</li>
                  <li>Route guards</li>
                  <li>State management</li>
                  <li>Error handling</li>
                </ul>
              </div>
            </div>
          </div>

          <div class="feature-examples">
            <h2 class="heading-lg">Feature Flag Examples</h2>

            <div class="feature-examples-grid">
              <div class="feature-example">
                <h3 class="heading-md">Cached Feature Flag</h3>
                <div class="card">
                  <p class="note">Uses cached values (5-minute cache)</p>

                  <bridge-feature-flag flagName="demo-flag">
                    <div class="feature-status active">
                      <p>Feature flag "demo-flag" is active</p>
                    </div>
                  </bridge-feature-flag>

                  <bridge-feature-flag flagName="demo-flag" [negate]="true">
                    <div class="feature-status">Create a feature flag called "demo-flag"</div>
                  </bridge-feature-flag>
                </div>
              </div>

              <div class="feature-example">
                <h3 class="heading-md">Live Feature Flag</h3>
                <div class="card">
                  <p class="note">Direct API call on each load</p>

                  <bridge-feature-flag flagName="demo-flag" [forceLive]="true">
                    <div class="feature-status active">
                      <p>Feature flag "demo-flag" is active</p>
                    </div>
                  </bridge-feature-flag>

                  <bridge-feature-flag flagName="demo-flag" [forceLive]="true" [negate]="true">
                    <div class="feature-status">Create a feature flag called "demo-flag"</div>
                  </bridge-feature-flag>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HomeComponent {}

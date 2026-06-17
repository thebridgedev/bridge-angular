/**
 * TenantSelector — Angular port of bridge-svelte's `sdk-auth/TenantSelector.svelte`.
 *
 * Shown when `authState() === 'tenant-selection'`. Lists the user's tenant
 * memberships (`AuthService.tenantUsers` signal) and selects one via
 * `selectTenant(id)`. Mirrors react's `TenantSelector.tsx`.
 *
 * Reactive translation (§5.1): react's `useBridgeStore((s) => s.tenantUsers)`
 * → the `AuthService.tenantUsers` signal.
 */
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import type { TenantUser } from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';
import { AuthFormWrapperComponent } from './shared/auth-form-wrapper.component';
import { AuthAlertComponent } from './shared/alert.component';
import { AuthSpinnerComponent } from './shared/spinner.component';

@Component({
  selector: 'bridge-tenant-selector',
  standalone: true,
  imports: [AuthFormWrapperComponent, AuthAlertComponent, AuthSpinnerComponent],
  template: `
    <bridge-auth-form-wrapper heading="Choose a workspace" [className]="className" [style]="style">
      @if (errorMsg()) {
        <bridge-auth-alert variant="error">{{ errorMsg() }}</bridge-auth-alert>
      }

      <div class="bridge-tenant-list">
        @for (tu of tenantUsers(); track tu.id) {
          <button
            type="button"
            class="bridge-tenant-item"
            [attr.data-tenant-id]="tu.id"
            [attr.data-loading]="selectedId() === tu.id"
            [disabled]="loading()"
            (click)="handleSelect(tu)"
          >
            <span class="bridge-tenant-avatar">
              @if (tu.tenant.logo) {
                <img [src]="tu.tenant.logo" [alt]="tu.tenant.name" />
              } @else {
                {{ initial(tu.tenant.name) }}
              }
            </span>
            <span class="bridge-tenant-info">
              <span class="bridge-tenant-name">{{ tu.tenant.name }}</span>
              <span class="bridge-tenant-user">{{ tu.fullName }}</span>
            </span>
            @if (selectedId() === tu.id) {
              <bridge-auth-spinner [size]="18" />
            }
          </button>
        }
      </div>
    </bridge-auth-form-wrapper>
  `,
})
export class TenantSelectorComponent {
  @Input() className = '';
  @Input() style = '';
  @Output() select = new EventEmitter<void>();
  @Output() error = new EventEmitter<Error>();

  private readonly authService = inject(AuthService);
  protected readonly tenantUsers = this.authService.tenantUsers;

  protected readonly loading = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly errorMsg = signal<string | null>(null);

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  async handleSelect(tenantUser: TenantUser): Promise<void> {
    if (this.loading()) return;
    this.errorMsg.set(null);
    this.selectedId.set(tenantUser.id);
    this.loading.set(true);
    try {
      await (this.authService.getBridgeAuth() as any).selectTenant(tenantUser.id);
      this.select.emit();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to select workspace.');
      this.error.emit(err);
    } finally {
      this.loading.set(false);
      this.selectedId.set(null);
    }
  }
}

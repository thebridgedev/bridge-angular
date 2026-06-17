/**
 * Angular port of bridge-svelte's `developer/ApiTokenManagement.svelte`.
 *
 * CRUD UI for long-lived API tokens, backed by auth-core's `ApiTokenService`
 * (via `getBridgeAuth().apiTokens`). Create (with privilege picker + optional
 * expiry), show-once token reveal, and revoke-with-confirmation.
 *
 * Reactive translation (§5.1): svelte `$state` → signals; `$effect(load)` →
 * `ngOnInit`; click-outside `$effect` → host `document:click` listener.
 */
import {
  Component,
  HostListener,
  Input,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ApiToken,
  AvailablePrivilege,
  CreateApiTokenInput,
} from '@nebulr-group/bridge-auth-core';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'bridge-api-token-management',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      [class]="className"
      [style]="style"
      data-bridge-api-tokens
      [attr.data-loading]="loading()"
      [attr.data-creating]="creating()"
    >
      <div class="bridge-api-header">
        <div>
          <h2 class="bridge-api-title">API Tokens</h2>
          <p class="bridge-api-subtitle">Long-lived JWT tokens for programmatic API access.</p>
        </div>
        <button class="bridge-btn bridge-btn-primary" (click)="toggleCreateForm()">
          {{ showCreateForm() ? '✕ Cancel' : '+ Create Token' }}
        </button>
      </div>

      @if (error()) {
        <div class="bridge-api-error-banner">{{ error() }}</div>
      }
      @if (success()) {
        <div class="bridge-api-success-banner">{{ success() }}</div>
      }

      @if (newToken()) {
        <div class="bridge-api-new-token-banner">
          <p class="bridge-api-new-token-warning">
            ⚠ Store this token securely — you won't be able to see it again.
          </p>
          <div class="bridge-api-new-token-row">
            <input
              class="bridge-input bridge-api-token-input"
              [type]="showToken() ? 'text' : 'password'"
              readonly
              [value]="newToken()"
            />
            <button class="bridge-btn-outline" (click)="showToken.set(!showToken())"
              [title]="showToken() ? 'Hide token' : 'Show token'">
              {{ showToken() ? '🙈' : '👁' }}
            </button>
            <button class="bridge-btn-outline" (click)="copyToClipboard(newToken()!)">Copy</button>
          </div>
          <button class="bridge-btn-outline" (click)="dismissNewToken()">Dismiss</button>
        </div>
      }

      @if (showCreateForm()) {
        <div class="bridge-api-inline-form">
          <h3 class="bridge-api-inline-form-title">New API Token</h3>
          <form class="bridge-api-inline-form-fields" (submit)="onSubmit($event)">
            <div class="bridge-api-inline-form-row">
              <div class="bridge-api-inline-field">
                <label class="bridge-label" for="token-name">Name <span class="bridge-api-required">*</span></label>
                <input id="token-name" class="bridge-input" type="text"
                  placeholder="e.g. CI pipeline token" required [(ngModel)]="createName" name="createName" />
              </div>
              <div class="bridge-api-inline-field">
                <label class="bridge-label">Privileges</label>
                <div class="bridge-privilege-picker" [attr.data-open]="privDropdownOpen()">
                  <div class="bridge-privilege-chips" (click)="privDropdownOpen.set(!privDropdownOpen())">
                    @for (priv of selectedPrivileges(); track priv) {
                      <span class="bridge-privilege-chip">
                        {{ priv }}
                        <button type="button" (click)="removePrivilege($event, priv)">×</button>
                      </span>
                    }
                    @if (!selectedPrivileges().length) {
                      <span class="bridge-privilege-placeholder">Select privileges…</span>
                    }
                  </div>
                  @if (privDropdownOpen()) {
                    <div class="bridge-privilege-dropdown">
                      <input class="bridge-privilege-search" type="text" placeholder="Search…"
                        [(ngModel)]="privSearchModel" name="privSearch" (click)="$event.stopPropagation()" />
                      @for (priv of filteredPrivileges(); track priv.key) {
                        <button type="button" class="bridge-privilege-option" (click)="addPrivilege($event, priv.key)">
                          <span class="bridge-privilege-option-key">{{ priv.key }}</span>
                          @if (priv.description) {
                            <span class="bridge-privilege-option-desc">{{ priv.description }}</span>
                          }
                        </button>
                      } @empty {
                        <div class="bridge-privilege-empty">No privileges found</div>
                      }
                    </div>
                  }
                </div>
              </div>
              <div class="bridge-api-inline-field bridge-api-inline-field--narrow">
                <label class="bridge-label" for="token-expiry">Expiry (optional)</label>
                <input id="token-expiry" class="bridge-input" type="date" [(ngModel)]="createExpiry" name="createExpiry" />
              </div>
            </div>
            <div class="bridge-api-inline-form-actions">
              <button type="submit" class="bridge-btn bridge-btn-primary" [disabled]="creating() || !createName.trim()">
                {{ creating() ? 'Creating…' : 'Create Token' }}
              </button>
            </div>
          </form>
        </div>
      }

      <div class="bridge-api-table-wrapper">
        @if (loading()) {
          <div class="bridge-api-empty">Loading…</div>
        } @else if (tokens().length === 0) {
          <div class="bridge-api-empty">No API tokens yet. Create one to get started.</div>
        } @else {
          <table class="bridge-api-table">
            <thead class="bridge-api-table-head">
              <tr>
                <th class="bridge-api-th">Name</th>
                <th class="bridge-api-th">Privileges</th>
                <th class="bridge-api-th">Created</th>
                <th class="bridge-api-th">Expires</th>
                <th class="bridge-api-th"></th>
              </tr>
            </thead>
            <tbody>
              @for (token of tokens(); track token.id) {
                <tr class="bridge-api-row">
                  <td class="bridge-api-td-name">{{ token.name }}</td>
                  <td class="bridge-api-td">
                    <div class="bridge-api-privileges">
                      @for (priv of token.privileges; track priv) {
                        <span class="bridge-badge">{{ priv }}</span>
                      }
                    </div>
                  </td>
                  <td class="bridge-api-td-muted">{{ formatDate(token.createdAt) }}</td>
                  <td class="bridge-api-td-muted">{{ formatDate(token.expireAt) }}</td>
                  <td class="bridge-api-td-actions">
                    <button class="bridge-btn-danger-sm" (click)="openRevoke(token)">Revoke</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>

    @if (revokeDialogOpen()) {
      <div class="bridge-dialog-overlay" role="presentation" (click)="closeRevoke()"></div>
      <div class="bridge-dialog" role="dialog" aria-modal="true">
        <h3 class="bridge-dialog-title">Revoke token?</h3>
        <p class="bridge-dialog-body">
          Token <strong>{{ revokeTarget()?.name }}</strong> will be permanently revoked and can no longer be used.
        </p>
        <div class="bridge-dialog-footer">
          <button class="bridge-btn-outline" (click)="closeRevoke()">Cancel</button>
          <button class="bridge-btn bridge-btn-danger" [disabled]="revoking()" (click)="confirmRevoke()">
            {{ revoking() ? 'Revoking…' : 'Revoke' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class ApiTokenManagementComponent implements OnInit {
  @Input() className = '';
  @Input() style = '';

  protected readonly tokens = signal<ApiToken[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly showCreateForm = signal(false);
  protected readonly creating = signal(false);
  protected createName = '';
  protected createExpiry = '';

  protected readonly availablePrivileges = signal<AvailablePrivilege[]>([]);
  protected readonly selectedPrivileges = signal<string[]>([]);
  protected privSearchModel = '';
  protected readonly privSearch = signal('');
  protected readonly privDropdownOpen = signal(false);

  protected readonly newToken = signal<string | null>(null);
  protected readonly showToken = signal(false);

  protected readonly revokeTarget = signal<ApiToken | null>(null);
  protected readonly revokeDialogOpen = signal(false);
  protected readonly revoking = signal(false);

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    void this.loadTokens();
  }

  filteredPrivileges(): AvailablePrivilege[] {
    const search = this.privSearchModel.toLowerCase();
    const selected = this.selectedPrivileges();
    return this.availablePrivileges().filter(
      (p) => !selected.includes(p.key) && p.key.toLowerCase().includes(search),
    );
  }

  private get apiTokens() {
    return this.authService.getBridgeAuth().apiTokens;
  }

  async loadTokens(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.tokens.set(await this.apiTokens.listTokens());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load API tokens');
    } finally {
      this.loading.set(false);
    }
  }

  async loadPrivileges(): Promise<void> {
    try {
      this.availablePrivileges.set(await this.apiTokens.listAvailablePrivileges());
    } catch {
      /* non-fatal — picker shows empty */
    }
  }

  toggleCreateForm(): void {
    const next = !this.showCreateForm();
    this.showCreateForm.set(next);
    if (next) {
      void this.loadPrivileges();
    } else {
      this.resetCreateForm();
    }
  }

  onSubmit(e: Event): void {
    e.preventDefault();
    void this.createToken();
  }

  async createToken(): Promise<void> {
    this.creating.set(true);
    this.error.set(null);
    try {
      const input: CreateApiTokenInput = {
        name: this.createName.trim(),
        privileges: this.selectedPrivileges(),
        expireAt: this.createExpiry || undefined,
      };
      const result = await this.apiTokens.createToken(input);
      this.newToken.set(result.token);
      this.tokens.set([result.record, ...this.tokens()]);
      this.showCreateForm.set(false);
      this.resetCreateForm();
      this.success.set('Token created. Copy it now — it will not be shown again.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      this.creating.set(false);
    }
  }

  resetCreateForm(): void {
    this.createName = '';
    this.selectedPrivileges.set([]);
    this.privSearchModel = '';
    this.privDropdownOpen.set(false);
    this.createExpiry = '';
  }

  addPrivilege(e: Event, key: string): void {
    e.stopPropagation();
    this.selectedPrivileges.set([...this.selectedPrivileges(), key]);
    this.privSearchModel = '';
  }

  removePrivilege(e: Event, key: string): void {
    e.stopPropagation();
    this.selectedPrivileges.set(this.selectedPrivileges().filter((p) => p !== key));
  }

  openRevoke(token: ApiToken): void {
    this.revokeTarget.set(token);
    this.revokeDialogOpen.set(true);
  }

  closeRevoke(): void {
    this.revokeDialogOpen.set(false);
    this.revokeTarget.set(null);
  }

  async confirmRevoke(): Promise<void> {
    const target = this.revokeTarget();
    if (!target) return;
    this.revoking.set(true);
    this.error.set(null);
    try {
      await this.apiTokens.revokeToken(target.id);
      this.tokens.set(this.tokens().filter((t) => t.id !== target.id));
      this.success.set(`Token "${target.name}" revoked.`);
      this.revokeDialogOpen.set(false);
      this.revokeTarget.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to revoke token');
    } finally {
      this.revoking.set(false);
    }
  }

  async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.success.set('Copied to clipboard!');
      setTimeout(() => this.success.set(null), 3000);
    } catch {
      this.error.set('Failed to copy to clipboard');
    }
  }

  dismissNewToken(): void {
    this.newToken.set(null);
    this.showToken.set(false);
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.privDropdownOpen()) return;
    const picker = document.querySelector('.bridge-privilege-picker');
    if (picker && !picker.contains(e.target as Node)) {
      this.privDropdownOpen.set(false);
    }
  }
}

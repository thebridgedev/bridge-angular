/**
 * TBP-644 — development-only "Live updates off — why?" corner badge.
 *
 * `provideBridge()` mounts this automatically once the app has bootstrapped
 * (see `RealtimeDevBadgeMounter`). It renders only in development mode
 * (`isDevMode()`) and only while live updates are actually off: refused
 * (`unauthorized`), connected but deaf (`degraded`), or retrying for longer
 * than 30 s. Opt out with `devBadge: false` in the Bridge config.
 *
 * Styles reset every element with `all: unset`, so the badge neither depends
 * on nor inherits from the host app's CSS.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  computed,
  effect,
  isDevMode,
  signal,
  viewChild,
  type OnDestroy,
} from '@angular/core';
import { realtimeStatusDetail } from '../../core/realtime-status';
import {
  REALTIME_BADGE_RETRYING_AFTER_MS,
  createRetryClock,
  realtimeBadgeView,
} from '../../core/realtime-dev-badge';

@Component({
  selector: 'bridge-realtime-dev-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div class="bridge-rt-root" data-testid="bridge-realtime-dev-badge-root">
        <span class="bridge-rt-sr" role="status" aria-live="polite">{{ liveText() }}</span>
        @if (visibleView(); as v) {
          <aside
            class="bridge-rt-badge"
            aria-label="Bridge live updates (development only)"
            data-testid="bridge-realtime-dev-badge"
            (keydown.escape)="collapse()"
          >
            <div class="bridge-rt-bar">
              <button
                #toggle
                type="button"
                class="bridge-rt-toggle"
                [attr.aria-expanded]="expanded()"
                aria-controls="bridge-realtime-dev-badge-panel"
                (click)="expanded.set(!expanded())"
              >
                <span class="bridge-rt-dot" aria-hidden="true">●</span> Live updates off — why?
              </button>
              <button
                type="button"
                class="bridge-rt-close"
                aria-label="Dismiss the live updates notice"
                (click)="dismiss(v.key)"
              >
                ×
              </button>
            </div>
            @if (expanded()) {
              <div id="bridge-realtime-dev-badge-panel" class="bridge-rt-panel">
                <div class="bridge-rt-row">
                  <span class="bridge-rt-label">Reason</span>
                  <code class="bridge-rt-code">{{ v.reason }}</code>
                </div>
                <div class="bridge-rt-row">
                  <span class="bridge-rt-label">Whose side</span>
                  <span class="bridge-rt-value">{{ v.sideLabel }}</span>
                </div>
                @if (v.ref) {
                  <div class="bridge-rt-row">
                    <span class="bridge-rt-label">Ref</span>
                    <code class="bridge-rt-code">{{ v.ref }}</code>
                  </div>
                }
                @if (v.docsUrl) {
                  <a class="bridge-rt-link" [href]="v.docsUrl" target="_blank" rel="noopener noreferrer"
                    >How to fix this ↗</a
                  >
                }
                <span class="bridge-rt-note">Development builds only — never shown to your users.</span>
              </div>
            }
          </aside>
        }
      </div>
    }
  `,
  styles: [
    `
      .bridge-rt-root,
      .bridge-rt-root * {
        all: unset;
        box-sizing: border-box;
      }
      .bridge-rt-root {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483000;
        display: block;
        font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        color: #f5f5f5;
      }
      .bridge-rt-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      .bridge-rt-badge {
        display: block;
        max-width: min(360px, calc(100vw - 32px));
        background: #1f2328;
        border: 1px solid #3d444d;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      }
      .bridge-rt-bar {
        display: flex;
        align-items: center;
      }
      .bridge-rt-toggle,
      .bridge-rt-close {
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 8px;
      }
      .bridge-rt-toggle {
        flex: 1;
      }
      .bridge-rt-close {
        font-size: 14px;
        line-height: 1;
        color: #b0b8c1;
      }
      .bridge-rt-toggle:focus-visible,
      .bridge-rt-close:focus-visible,
      .bridge-rt-link:focus-visible {
        outline: 2px solid #58a6ff;
        outline-offset: 1px;
      }
      .bridge-rt-dot {
        color: #f85149;
      }
      .bridge-rt-panel {
        display: block;
        padding: 4px 10px 10px;
        border-top: 1px solid #3d444d;
      }
      .bridge-rt-row {
        display: flex;
        gap: 8px;
        padding-top: 6px;
      }
      .bridge-rt-label {
        flex: 0 0 72px;
        color: #9198a1;
      }
      .bridge-rt-value {
        flex: 1;
      }
      .bridge-rt-code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        overflow-wrap: anywhere;
      }
      .bridge-rt-link {
        display: inline-block;
        margin-top: 8px;
        color: #58a6ff;
        text-decoration: underline;
        cursor: pointer;
      }
      .bridge-rt-note {
        display: block;
        margin-top: 8px;
        color: #9198a1;
        font-size: 11px;
      }
    `,
  ],
})
export class RealtimeDevBadgeComponent implements OnDestroy {
  /** Set false to never render (the mounter passes `config.devBadge`). */
  @Input() enabled = true;

  /** Read once: dev mode cannot change for the lifetime of the app. */
  private readonly devMode = isDevMode();
  private readonly retryClock = createRetryClock();
  private readonly now = signal(Date.now());
  private readonly dismissedKey = signal<string | undefined>(undefined);
  private readonly toggleRef = viewChild<ElementRef<HTMLButtonElement>>('toggle');
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly expanded = signal(false);
  private readonly status = realtimeStatusDetail;
  /** Start of the current retry run — stable across closed/connecting flips. */
  private readonly retryingSince = computed(() => this.retryClock(this.status(), Date.now()));
  private readonly view = computed(() =>
    realtimeBadgeView(this.status(), this.retryingSince(), this.now()),
  );
  protected readonly visibleView = computed(() => {
    const v = this.view();
    return v && v.key !== this.dismissedKey() ? v : null;
  });
  protected readonly liveText = computed(() => {
    const v = this.visibleView();
    return v ? `Bridge live updates are off: ${v.reason}` : '';
  });

  constructor() {
    // Tick `now` once the retrying threshold passes — nothing else re-renders.
    effect(() => {
      const since = this.retryingSince();
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      if (since === undefined) return;
      const remaining = since + REALTIME_BADGE_RETRYING_AFTER_MS - Date.now();
      this.timer = setTimeout(() => this.now.set(Date.now()), Math.max(0, remaining) + 50);
    });
  }

  protected get show(): boolean {
    return this.devMode && this.enabled;
  }

  protected dismiss(key: string): void {
    this.dismissedKey.set(key);
    this.expanded.set(false);
  }

  protected collapse(): void {
    if (!this.expanded()) return;
    this.expanded.set(false);
    this.toggleRef()?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}

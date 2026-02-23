import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeatureFlagService } from '../../shared/services/feature-flag.service';

@Component({
  selector: 'bridge-feature-flag',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (shouldRender()) {
      <ng-content></ng-content>
    }
  `,
})
export class FeatureFlagComponent implements OnInit {
  @Input({ required: true }) flagName!: string;
  @Input() forceLive = false;
  @Input() negate = false;
  @Input() renderWhenDisabled = false;

  private readonly _enabled = signal(false);

  protected readonly shouldRender = computed(() => {
    const effectiveEnabled = this.negate ? !this._enabled() : this._enabled();
    if (this.renderWhenDisabled) return true;
    return effectiveEnabled;
  });

  constructor(private featureFlagService: FeatureFlagService) {}

  async ngOnInit(): Promise<void> {
    const result = await this.featureFlagService.isFeatureEnabled(
      this.flagName,
      this.forceLive,
    );
    this._enabled.set(result);
  }
}

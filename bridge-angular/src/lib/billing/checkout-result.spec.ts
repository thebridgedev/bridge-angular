/**
 * TBP-944 (svelte TBP-813) — the one-shot "a checkout just finished" signal the
 * landing page reads. In memory only; whoever shows it clears it, so it shows once.
 */
import { effect, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkoutResult,
  clearCheckoutResult,
  markCheckoutComplete,
  takeCheckoutResult,
} from './checkout-result';

afterEach(() => clearCheckoutResult());

describe('checkoutResult (TBP-944)', () => {
  it('starts empty', () => {
    expect(checkoutResult()).toBeNull();
    expect(takeCheckoutResult()).toBeNull();
  });

  it('markCheckoutComplete sets what the signal reads', () => {
    markCheckoutComplete({ kind: 'checkout' });
    expect(checkoutResult()).toEqual({ kind: 'checkout' });
  });

  it('carries the plan name of a Free pick', () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    expect(checkoutResult()).toEqual({ kind: 'plan', planName: 'Free' });
  });

  it('a later result replaces an earlier one', () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    markCheckoutComplete({ kind: 'checkout' });
    expect(checkoutResult()).toEqual({ kind: 'checkout' });
  });

  it('takeCheckoutResult returns the result once, then nothing', () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Pro' });
    expect(takeCheckoutResult()).toEqual({ kind: 'plan', planName: 'Pro' });
    expect(takeCheckoutResult()).toBeNull();
    expect(checkoutResult()).toBeNull();
  });

  it('clearCheckoutResult forgets it without showing it', () => {
    markCheckoutComplete({ kind: 'checkout' });
    clearCheckoutResult();
    expect(checkoutResult()).toBeNull();
    expect(takeCheckoutResult()).toBeNull();
  });

  it('an effect reading it sees it set and then cleared', () => {
    const seen: unknown[] = [];
    const injector = TestBed.inject(Injector);
    const ref = runInInjectionContext(injector, () => effect(() => seen.push(checkoutResult())));
    TestBed.flushEffects();
    markCheckoutComplete({ kind: 'checkout' });
    TestBed.flushEffects();
    takeCheckoutResult();
    TestBed.flushEffects();
    ref.destroy();
    expect(seen).toEqual([null, { kind: 'checkout' }, null]);
  });

  it('the exported signal is read-only: apps cannot set it', () => {
    expect(typeof checkoutResult).toBe('function');
    expect((checkoutResult as unknown as { set?: unknown }).set).toBeUndefined();
    expect((checkoutResult as unknown as { update?: unknown }).update).toBeUndefined();
  });
});

/**
 * Vitest setup for Angular TestBed. Initializes zone.js + the browser-dynamic
 * testing environment once per worker so component specs can render templates.
 */
import '@angular/compiler';
import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// Tests mock Bridge's API. A request that reaches a real Bridge host (the
// default `https://api.thebridge.dev`, when a stub forgot `apiBaseUrl`) fails
// here instead of calling production.
const realFetch = globalThis.fetch?.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/^https?:\/\/([^/]+\.)?thebridge\.dev(?=[:/]|$)/i.test(url)) {
    throw new Error(`[test-setup] blocked a request to production Bridge: ${url}`);
  }
  if (!realFetch) throw new Error('[test-setup] no fetch in this environment');
  return realFetch(input, init);
}) as typeof fetch;

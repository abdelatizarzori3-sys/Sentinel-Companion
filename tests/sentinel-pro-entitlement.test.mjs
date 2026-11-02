import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'mobile-web/sentinel-pro-entitlement.js'), 'utf8');
const serverSource = readFileSync(resolve(root, 'server.mjs'), 'utf8');

function loadEntitlement(responseFactory) {
  const calls = [];
  const sandbox = {
    window: {
      fetch: async (...args) => {
        calls.push(args);
        return responseFactory();
      },
    },
  };
  Function('window', source)(sandbox.window);
  return { entitlement: sandbox.window.SentinelProEntitlement, calls };
}

test('Pro entitlement is fail-closed until a verified server subscription is returned', () => {
  const { entitlement } = loadEntitlement(() => ({ ok: true, json: async () => ({ verified: false, subject: 'account-1' }) }));
  assert.equal(entitlement.getState().active, false);
  assert.deepEqual(Object.keys(entitlement).sort(), ['getState', 'refresh', 'subscribe']);
  assert.doesNotMatch(source, /localStorage|sessionStorage|URLSearchParams|activate|activation/i);

  return entitlement.refresh().then(state => {
    assert.equal(state.active, false);
    assert.equal(state.reason, 'unverified_response');
  });
});

test('Pro entitlement accepts only an active, unexpired, verified subscription from the server', async () => {
  const { entitlement, calls } = loadEntitlement(() => ({
    ok: true,
    json: async () => ({
      verified: true,
      subject: 'account-1',
      subscription: { status: 'active', currentPeriodEnd: '2030-01-01T00:00:00.000Z' },
    }),
  }));

  const state = await entitlement.refresh();
  assert.equal(state.active, true);
  assert.equal(state.subject, 'account-1');
  assert.equal(calls[0][0], '/api/entitlements/me');
  assert.equal(calls[0][1].credentials, 'include');
  assert.equal(calls[0][1].cache, 'no-store');
});

test('an expired or unavailable entitlement cannot unlock the personal library', async () => {
  const expired = loadEntitlement(() => ({
    ok: true,
    json: async () => ({
      verified: true,
      subject: 'account-1',
      subscription: { status: 'active', currentPeriodEnd: '2020-01-01T00:00:00.000Z' },
    }),
  }));
  assert.equal((await expired.entitlement.refresh()).reason, 'expired');
  assert.equal(expired.entitlement.getState().active, false);

  const unavailable = loadEntitlement(() => ({ ok: false, json: async () => ({}) }));
  assert.equal((await unavailable.entitlement.refresh()).reason, 'service_unavailable');
  assert.equal(unavailable.entitlement.getState().active, false);
  assert.match(serverSource, /\/api\/entitlements\/me/);
  assert.match(serverSource, /ENTITLEMENT_NOT_CONFIGURED/);
});

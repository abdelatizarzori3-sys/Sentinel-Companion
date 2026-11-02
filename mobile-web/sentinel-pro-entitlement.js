/* Sentinel Pro entitlement: the server is the only source of subscription authority. */
window.SentinelProEntitlement = (() => {
  const ENTITLEMENT_ENDPOINT = '/api/entitlements/me';
  const ACTIVE_STATUS = 'active';

  function stateFor(reason, checkedAt) {
    return Object.freeze({
      active: false,
      status: reason === 'expired' || reason === 'canceled' || reason === 'inactive' ? 'inactive' : 'unavailable',
      reason,
      subject: null,
      expiresAt: null,
      checkedAt,
    });
  }

  function toVerifiedState(payload, checkedAt) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return stateFor('invalid_response', checkedAt);
    if (payload.verified !== true) return stateFor('unverified_response', checkedAt);
    if (typeof payload.subject !== 'string' || !payload.subject.trim()) return stateFor('invalid_subject', checkedAt);

    const subscription = payload.subscription;
    if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) return stateFor('invalid_subscription', checkedAt);
    if (subscription.status !== ACTIVE_STATUS) {
      const reason = ['expired', 'canceled', 'inactive'].includes(subscription.status) ? subscription.status : 'inactive';
      return stateFor(reason, checkedAt);
    }
    if (typeof subscription.currentPeriodEnd !== 'string') return stateFor('invalid_expiration', checkedAt);
    const expiresAt = new Date(subscription.currentPeriodEnd);
    if (Number.isNaN(expiresAt.getTime())) return stateFor('invalid_expiration', checkedAt);
    if (expiresAt.getTime() <= Date.now()) return stateFor('expired', checkedAt);

    return Object.freeze({
      active: true,
      status: 'active',
      reason: 'verified_subscription',
      subject: payload.subject.trim(),
      expiresAt: expiresAt.toISOString(),
      checkedAt,
    });
  }

  function createController() {
    let state = stateFor('not_checked', null);
    let inFlight = null;
    const listeners = new Set();

    function publish(nextState) {
      state = nextState;
      listeners.forEach(listener => listener(state));
      return state;
    }

    async function refresh() {
      if (inFlight) return inFlight;
      const checkedAt = new Date().toISOString();
      publish(Object.freeze({ ...stateFor('checking', checkedAt), status: 'checking' }));
      inFlight = (async () => {
        try {
          const response = await window.fetch(ENTITLEMENT_ENDPOINT, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
          if (!response?.ok) return publish(stateFor('service_unavailable', checkedAt));
          const payload = await response.json();
          return publish(toVerifiedState(payload, checkedAt));
        } catch {
          return publish(stateFor('service_unavailable', checkedAt));
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    }

    function getState() {
      if (state.active && state.expiresAt && Date.parse(state.expiresAt) <= Date.now()) {
        return stateFor('expired', new Date().toISOString());
      }
      return state;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    return Object.freeze({ refresh, getState, subscribe });
  }

  return createController();
})();

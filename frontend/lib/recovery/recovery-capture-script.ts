/** Root-document capture; navigation handling is also installed for client routes. */
export const RECOVERY_CAPTURE_SCRIPT = `
(() => {
  const key = 'pcsRecoveryView';
  const nativePush = history.pushState.bind(history);
  const nativeReplace = history.replaceState.bind(history);
  let entry = 0;
  let token = null;
  let snapshot = { mode: 'request', token: null, entry };
  const emit = (mode, value = null) => {
    if (snapshot.mode === mode && snapshot.token === value && snapshot.entry === entry) return;
    snapshot = { mode, token: value, entry };
    window.dispatchEvent(new Event('pcs:recovery-view'));
  };
  const isRecovery = (url) => url.origin === location.origin && url.pathname.replace(/\\/$/, '') === '/recuperar';
  const publishEntry = (fresh = true) => {
    if (fresh) entry += 1;
    if (!isRecovery(new URL(location.href))) {
      token = null;
      emit('request');
      return;
    }
    const hash = location.hash;
    if (hash) {
      const match = /^#token=([A-Za-z0-9_-]{43})$/.exec(hash);
      const nextState = Object.assign({}, history.state && typeof history.state === 'object' ? history.state : {});
      nextState[key] = 'link';
      try {
        nativeReplace(nextState, '', location.pathname + location.search);
      } catch {
        token = null;
        emit('blocked');
        return;
      }
      token = match ? match[1] : null;
      emit(match ? 'link' : 'invalid', token);
      return;
    }
    token = null;
    if (history.state && history.state[key] === 'link') emit('unavailable');
    else emit('request');
  };
  const manager = {
    snapshot: () => snapshot,
    inspectEntry: () => {
      if (snapshot.mode === 'link' && token) return;
      if (['invalid', 'blocked', 'unavailable'].includes(snapshot.mode)) return;
      publishEntry(false);
    },
    discardLink: () => { token = null; emit('unavailable'); },
    startRequest: () => {
      token = null;
      entry += 1;
      const nextState = Object.assign({}, history.state && typeof history.state === 'object' ? history.state : {});
      nextState[key] = 'request';
      try {
        nativeReplace(nextState, '', location.pathname + location.search);
      } catch {
        emit('blocked');
        return;
      }
      emit('request');
    },
  };
  window.__pcsRecoveryManager = manager;
  const checkNavigation = (before, fresh = false) => {
    const after = new URL(location.href);
    if (fresh || before.pathname !== after.pathname || before.search !== after.search || before.hash !== after.hash) {
      if (isRecovery(after)) publishEntry();
      else { entry += 1; token = null; emit('request'); }
    }
  };
  history.pushState = function(state, unused, url) {
    const before = new URL(location.href);
    const target = url ? new URL(String(url), location.href) : before;
    const nextState = Object.assign({}, state && typeof state === 'object' ? state : {});
    if (isRecovery(target) && !target.hash) nextState[key] = 'request';
    nativePush(nextState, unused, url);
    checkNavigation(before, true);
  };
  history.replaceState = function(state, unused, url) {
    const before = new URL(location.href);
    const target = url ? new URL(String(url), location.href) : before;
    const nextState = Object.assign({}, state && typeof state === 'object' ? state : {});
    if (isRecovery(before) && isRecovery(target) && history.state && history.state[key] === 'link' && !Object.prototype.hasOwnProperty.call(nextState, key)) {
      nextState[key] = 'link';
    }
    nativeReplace(nextState, unused, url);
    checkNavigation(before);
  };
  window.addEventListener('popstate', () => publishEntry());
  window.addEventListener('hashchange', (event) => {
    // popstate puede haber capturado y saneado esta navegación antes del hashchange.
    if (event.newURL && event.newURL !== location.href) return;
    publishEntry();
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) publishEntry(); });
  window.addEventListener('pagehide', () => { token = null; entry += 1; if (snapshot.mode === 'link') emit('unavailable'); else emit(snapshot.mode); });
  publishEntry();
})();
`;

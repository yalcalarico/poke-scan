/** Root-document capture; navigation handling is also installed for client routes. */
export const RECOVERY_CAPTURE_SCRIPT = `
(() => {
  const key = 'pcsRecoveryView';
  let token = null;
  let snapshot = { mode: 'request', token: null };
  const emit = (mode, value = null) => {
    snapshot = { mode, token: value };
    window.dispatchEvent(new Event('pcs:recovery-view'));
  };
  const isRecovery = (url) => url.origin === location.origin && url.pathname.replace(/\\/$/, '') === '/recuperar';
  const publishEntry = () => {
    if (!isRecovery(new URL(location.href))) {
      token = null;
      return;
    }
    const hash = location.hash;
    if (hash) {
      const match = /^#token=([A-Za-z0-9_-]{43})$/.exec(hash);
      const nextState = Object.assign({}, history.state && typeof history.state === 'object' ? history.state : {});
      nextState[key] = 'link';
      try {
        history.replaceState(nextState, '', location.pathname + location.search);
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
      publishEntry();
    },
    startRequest: () => {
      token = null;
      const nextState = Object.assign({}, history.state && typeof history.state === 'object' ? history.state : {});
      delete nextState[key];
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
  const nativePush = history.pushState.bind(history);
  const nativeReplace = history.replaceState.bind(history);
  const checkNavigation = (before) => {
    const after = new URL(location.href);
    if (before.pathname !== after.pathname || before.hash !== after.hash) {
      if (isRecovery(after)) publishEntry();
      else { token = null; emit('request'); }
    }
  };
  history.pushState = function(state, unused, url) {
    const before = new URL(location.href);
    nativePush(state, unused, url);
    checkNavigation(before);
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
  window.addEventListener('popstate', publishEntry);
  window.addEventListener('hashchange', publishEntry);
  window.addEventListener('pageshow', (event) => { if (event.persisted) publishEntry(); });
  window.addEventListener('pagehide', () => { token = null; if (snapshot.mode === 'link') emit('unavailable'); });
  publishEntry();
})();
`;

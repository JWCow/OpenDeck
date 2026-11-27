(() => {
  'use strict';

  const MAX_HISTORY = 40;
  const globalListeners = new Set();
  const machines = {};
  const padTransitionLog = [];
  let padStateReader = null;

  function cloneValue(val) {
    if (val == null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(cloneValue);
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === 'password' || k === 'ws') continue;
      if (typeof v === 'function') continue;
      out[k] = cloneValue(v);
    }
    return out;
  }

  function emitGlobal(entry) {
    for (const fn of [...globalListeners]) {
      try {
        fn(entry);
      } catch {}
    }
  }

  /**
   * Create a lightweight, zero-dependency finite state machine with guarded transitions,
   * reactive subscriptions, and a bounded transition history for DX and AX observability.
   */
  function createMachine(spec) {
    if (!spec || !spec.id || !spec.initial) {
      throw new Error('createMachine requires { id, initial }');
    }
    const id = String(spec.id);
    const transitions = spec.transitions || {};
    const onEnter = spec.onEnter || {};
    const onTransition = typeof spec.onTransition === 'function' ? spec.onTransition : null;
    const context = { ...(spec.context || {}) };
    let state = String(spec.initial);
    const listeners = new Set();
    const history = [];

    function recordHistory(event, from, to, detail) {
      const entry = {
        at: Date.now(),
        machine: id,
        event: String(event),
        from,
        to,
      };
      if (detail !== undefined) entry.detail = detail;
      history.push(entry);
      if (history.length > MAX_HISTORY) history.shift();
      return entry;
    }

    function resolveRule(fromState, event) {
      const stateRules = transitions[fromState];
      if (stateRules && Object.prototype.hasOwnProperty.call(stateRules, event)) {
        return stateRules[event];
      }
      const wildcardRules = transitions['*'];
      if (wildcardRules && Object.prototype.hasOwnProperty.call(wildcardRules, event)) {
        return wildcardRules[event];
      }
      return null;
    }

    function normalizeRule(rule) {
      if (!rule) return null;
      if (typeof rule === 'string') return { target: rule };
      if (typeof rule === 'object') return rule;
      return null;
    }

    const machine = {
      id,
      get state() {
        return state;
      },
      context,
      get history() {
        return history.map((h) => ({ ...h }));
      },
      matches(...candidates) {
        return candidates.includes(state);
      },
      can(event, payload) {
        const rule = normalizeRule(resolveRule(state, event));
        if (!rule) return false;
        if (typeof rule.guard === 'function') {
          try {
            return Boolean(rule.guard(context, payload, state));
          } catch {
            return false;
          }
        }
        return true;
      },
      send(event, payload) {
        const rule = normalizeRule(resolveRule(state, event));
        if (!rule) {
          return { changed: false, state, prevState: state, event, reason: 'unhandled' };
        }
        if (typeof rule.guard === 'function') {
          let allowed = false;
          try {
            allowed = Boolean(rule.guard(context, payload, state));
          } catch {
            allowed = false;
          }
          if (!allowed) {
            return { changed: false, state, prevState: state, event, reason: 'guarded' };
          }
        }

        const prevState = state;
        const nextState = rule.target != null ? String(rule.target) : prevState;
        const sameState = nextState === prevState;

        if (typeof rule.action === 'function') {
          rule.action(context, payload, prevState, nextState);
        }

        state = nextState;
        const detail = typeof rule.detail === 'function' ? rule.detail(context, payload) : undefined;
        const entry = recordHistory(event, prevState, nextState, detail);

        if (!sameState && typeof onEnter[nextState] === 'function') {
          onEnter[nextState](context, payload, prevState, event);
        }
        if (onTransition) {
          onTransition({ machine: id, state: nextState, prevState, event, payload, context });
        }
        const snap = {
          machine: id,
          state: nextState,
          prevState,
          event,
          context: cloneValue(context),
          at: entry.at,
        };
        for (const fn of [...listeners]) {
          try {
            fn(snap);
          } catch {}
        }
        emitGlobal(snap);

        return { changed: !sameState, state: nextState, prevState, event, context };
      },
      subscribe(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      snapshot() {
        return {
          id,
          state,
          context: cloneValue(context),
          history: history.map((h) => ({ ...h })),
        };
      },
    };

    if (typeof onEnter[state] === 'function') {
      try {
        onEnter[state](context, undefined, null, '@init');
      } catch {}
    }

    machines[id] = machine;
    return machine;
  }

  function recordPadTransition(entry) {
    if (!entry || !entry.key) return;
    const item = {
      at: Date.now(),
      machine: 'pads',
      key: String(entry.key),
      from: String(entry.from || 'idle'),
      to: String(entry.to || 'idle'),
      event: String(entry.event || ''),
    };
    padTransitionLog.push(item);
    if (padTransitionLog.length > MAX_HISTORY) padTransitionLog.shift();
    emitGlobal({
      machine: 'pads',
      state: item.to,
      prevState: item.from,
      event: item.event,
      context: { key: item.key },
      at: item.at,
    });
  }

  function registerPadStateReader(fn) {
    padStateReader = typeof fn === 'function' ? fn : null;
  }

  function subscribeState(fn) {
    if (typeof fn !== 'function') return () => {};
    globalListeners.add(fn);
    return () => globalListeners.delete(fn);
  }

  function getAppState() {
    const Deck = window.Deck || {};
    const activePage = typeof Deck.getActivePage === 'function' ? Deck.getActivePage() : null;
    const connMachine = machines.connection;
    const wsMachine = machines.workspace;
    const snapMachine = machines.snapshots;
    const phoneMachine = machines.phoneHost;
    const bannerMachine = machines.layoutBanner;
    const linkMachine = machines.importLink;

    const openDlg = typeof document !== 'undefined' ? document.querySelector('dialog[open]') : null;
    const padRuntime = padStateReader
      ? padStateReader()
      : { busy: [], armed: [], held: [], autoOff: [], macro: [], pendingHoldRestores: 0 };

    const recentTransitions = [
      ...Object.values(machines).flatMap((m) => m.history),
      ...padTransitionLog,
    ]
      .sort((a, b) => a.at - b.at)
      .slice(-25);

    const cfgWs = Deck.cfg?.ws || {};
    return {
      version: Deck.VERSION || '',
      connection: {
        state: connMachine ? connMachine.state : (Deck.obs?.status === 'ok' ? 'connected' : 'disconnected'),
        status: Deck.obs?.status || 'bad',
        host: String(cfgWs.host || ''),
        port: Number(cfgWs.port) || 4455,
        retryCount: Number(Deck.obs?.retryCount) || 0,
        nextRetrySec: connMachine?.context?.nextRetrySec || 0,
        lastCloseCode: connMachine?.context?.lastCloseCode ?? null,
        lastCloseReason: connMachine?.context?.lastCloseReason || '',
        syncQueued: Boolean(connMachine?.context?.syncQueued || Deck.obs?.queuedSync),
      },
      workspace: {
        mode: wsMachine ? wsMachine.state : (Deck.editMode ? 'edit' : 'run'),
        submode: wsMachine?.context?.submode || 'browse',
        popover: wsMachine?.context?.popover || 'none',
        cleanView: Boolean(typeof document !== 'undefined' && document.documentElement?.dataset?.clean === '1'),
        pageLocked: typeof Deck.isPageLocked === 'function' ? Boolean(Deck.isPageLocked()) : false,
        selectedCount: typeof Deck.getSelectedPads === 'function' ? Deck.getSelectedPads().size : 0,
        armedCommand: typeof Deck.getArmedPaletteItem === 'function' && Deck.getArmedPaletteItem()
          ? (Deck.getArmedPaletteItem().label || Deck.getArmedPaletteItem().type || '')
          : '',
        activeDialog: openDlg ? openDlg.id : '',
      },
      activePage: activePage
        ? {
            id: activePage.id,
            name: activePage.name,
            cols: activePage.cols,
            rows: activePage.rows,
            sceneName: activePage.sceneName || '',
            isFallback: Boolean(activePage.isFallback),
            configuredPadCount: (activePage.pads || []).filter((p) => p && p.type !== 'none').length,
          }
        : null,
      pads: padRuntime,
      snapshots: snapMachine ? snapMachine.snapshot().context : { availability: 'checking', saveCycle: 'idle' },
      phoneHost: phoneMachine ? { state: phoneMachine.state, ...phoneMachine.snapshot().context } : { state: 'unavailable' },
      layoutBanner: bannerMachine ? { state: bannerMachine.state, ...bannerMachine.snapshot().context } : { state: 'disabled' },
      importLink: linkMachine ? { state: linkMachine.state } : { state: 'closed' },
      history: typeof Deck.getHistoryCounts === 'function'
        ? Deck.getHistoryCounts()
        : { undoCount: 0, redoCount: 0 },
      recentTransitions,
    };
  }

  window.Deck = window.Deck || {};
  Object.assign(window.Deck, {
    createMachine,
    machines,
    recordPadTransition,
    registerPadStateReader,
    subscribeState,
    getAppState,
  });
})();

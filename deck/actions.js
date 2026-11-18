(() => {
  'use strict';

  const Deck = window.Deck;

  function isPadActive(p) {
    const { obs } = Deck;
    if (!p || p.type === 'none') return false;
    if (p.type === 'scene') return Boolean(p.sceneName && obs.programScene === p.sceneName);
    if (p.type === 'source') {
      const items = obs.itemsByScene[p.sceneName] || [];
      return items.some((it) => it.sourceName === p.sourceName && it.sceneItemEnabled);
    }
    if (p.type === 'filter') {
      const flts = obs.filtersBySource[p.sourceName] || [];
      return flts.some((f) => f.filterName === p.filterName && f.filterEnabled);
    }
    if (p.type === 'mute') return Boolean(p.inputName && obs.mutes[p.inputName]);
    return false;
  }

  async function execAction(a) {
    const { obs, obsCall, refreshFilters } = Deck;
    if (!a || a.type === 'none' || a.type === 'wait') return;
    if (a.type === 'scene' && a.sceneName) {
      await obsCall('SetCurrentProgramScene', { sceneName: a.sceneName });
      obs.programScene = a.sceneName;
      Deck.updateSceneHeader();
    } else if (a.type === 'source' && a.sceneName && a.sourceName) {
      let items = obs.itemsByScene[a.sceneName];
      if (!items) {
        const req = obs.groups.has(a.sceneName) ? 'GetGroupSceneItemList' : 'GetSceneItemList';
        items = (await obsCall(req, { sceneName: a.sceneName })).sceneItems || [];
        obs.itemsByScene[a.sceneName] = items;
      }
      const targets = items.filter((it) => it.sourceName === a.sourceName);
      if (!targets.length) throw new Error(`Source "${a.sourceName}" not in "${a.sceneName}"`);
      const mode = a.mode || 'toggle';
      if (mode === 'solo') {
        for (const it of items) {
          const want = it.sourceName === a.sourceName;
          if (it.sceneItemEnabled !== want) {
            await obsCall('SetSceneItemEnabled', { sceneName: a.sceneName, sceneItemId: it.sceneItemId, sceneItemEnabled: want });
            it.sceneItemEnabled = want;
          }
        }
      } else {
        const want = mode === 'show' ? true : mode === 'hide' ? false : !targets[0].sceneItemEnabled;
        for (const it of targets) {
          await obsCall('SetSceneItemEnabled', { sceneName: a.sceneName, sceneItemId: it.sceneItemId, sceneItemEnabled: want });
          it.sceneItemEnabled = want;
        }
      }
    } else if (a.type === 'filter' && a.sourceName && a.filterName) {
      const mode = a.mode || 'toggle';
      let want;
      if (mode === 'enable') want = true;
      else if (mode === 'disable') want = false;
      else {
        const flts = await refreshFilters(a.sourceName);
        const cur = flts.find((f) => f.filterName === a.filterName);
        if (!cur) throw new Error(`Filter "${a.filterName}" not on "${a.sourceName}"`);
        want = !cur.filterEnabled;
      }
      await obsCall('SetSourceFilterEnabled', { sourceName: a.sourceName, filterName: a.filterName, filterEnabled: want });
      const flts = obs.filtersBySource[a.sourceName];
      if (flts) {
        const f = flts.find((x) => x.filterName === a.filterName);
        if (f) f.filterEnabled = want;
      }
    } else if (a.type === 'mute' && a.inputName) {
      const mode = a.mode || 'toggle';
      if (mode === 'toggle') {
        const res = await obsCall('ToggleInputMute', { inputName: a.inputName });
        if (typeof res.inputMuted === 'boolean') obs.mutes[a.inputName] = res.inputMuted;
      } else {
        const want = mode === 'mute';
        await obsCall('SetInputMute', { inputName: a.inputName, inputMuted: want });
        obs.mutes[a.inputName] = want;
      }
    }
    Deck.renderGrid();
  }

  function abortMacro(idx) {
    const m = Deck.activeMacros.get(idx);
    if (!m) return;
    m.aborted = true;
    clearTimeout(m.waitTimer);
    clearInterval(m.tickTimer);
    if (m.resolveWait) m.resolveWait();
    Deck.activeMacros.delete(idx);
  }

  async function runMacro(idx, pad) {
    const { activeMacros, setMsg } = Deck;
    if (activeMacros.has(idx)) {
      abortMacro(idx);
      setMsg(`Cancelled macro: ${pad.label || `Pad ${idx + 1}`}`);
      Deck.renderGrid();
      return;
    }
    const steps = pad.steps || [];
    if (!steps.length) return;
    const ctx = { aborted: false, waitTimer: null, tickTimer: null, endsAt: 0, resolveWait: null };
    activeMacros.set(idx, ctx);
    Deck.renderGrid();
    try {
      for (const st of steps) {
        if (ctx.aborted) break;
        if (st.type === 'wait') {
          const ms = Math.max(0, Number(st.delayMs) || 0);
          ctx.endsAt = Date.now() + ms;
          Deck.updateMacroTicks();
          ctx.tickTimer = setInterval(() => Deck.updateMacroTicks(), 200);
          await new Promise((res) => {
            ctx.resolveWait = res;
            ctx.waitTimer = setTimeout(res, ms);
          });
          clearInterval(ctx.tickTimer);
          ctx.resolveWait = null;
          ctx.endsAt = 0;
        } else {
          await execAction(st);
        }
      }
      if (!ctx.aborted) setMsg(`Macro done: ${pad.label || `Pad ${idx + 1}`}`);
    } catch (e) {
      setMsg(`Macro error: ${e.message}`);
    } finally {
      clearInterval(ctx.tickTimer);
      clearTimeout(ctx.waitTimer);
      if (activeMacros.get(idx) === ctx) activeMacros.delete(idx);
      Deck.renderGrid();
    }
  }

  async function runPanic() {
    const { activeMacros, cfg, obs, obsCall, setMsg } = Deck;
    const running = [...activeMacros.keys()];
    running.forEach(abortMacro);
    let ran = 0;
    const errs = [];
    if (cfg.panicSteps.length) {
      for (const st of cfg.panicSteps) {
        try {
          await execAction(st);
          ran++;
        } catch (e) {
          errs.push(e.message);
        }
      }
    } else {
      const targets = new Map();
      const collect = (st) => {
        if (st && st.type === 'filter' && st.sourceName && st.filterName) {
          targets.set(`${st.sourceName}\0${st.filterName}`, { sourceName: st.sourceName, filterName: st.filterName });
        }
      };
      cfg.pads.forEach((p) => { collect(p); (p.steps || []).forEach(collect); });
      for (const { sourceName, filterName } of targets.values()) {
        if (isPadActive({ type: 'filter', sourceName, filterName })) {
          try {
            await obsCall('SetSourceFilterEnabled', { sourceName, filterName, filterEnabled: false });
            const f = (obs.filtersBySource[sourceName] || []).find((x) => x.filterName === filterName);
            if (f) f.filterEnabled = false;
            ran++;
          } catch (e) {
            errs.push(e.message);
          }
        }
      }
    }
    setMsg(
      `PANIC executed (${running.length} macro(s) stopped, ${ran} reset action(s))`
      + (errs.length ? ` — ${errs.length} error(s): ${errs[0]}` : '')
    );
    Deck.renderGrid();
  }

  async function onPadClick(idx) {
    if (Deck.editMode) { Deck.openPadEditor(idx); return; }
    const p = Deck.cfg.pads[idx];
    if (!p || p.type === 'none') { Deck.openPadEditor(idx); return; }
    if (p.type === 'panic') { await runPanic(); return; }
    if (p.type === 'macro') { await runMacro(idx, p); return; }
    try {
      await execAction(p);
      Deck.setMsg(`Ran: ${p.label || p.sceneName || p.filterName || p.sourceName || p.inputName || p.type}`);
    } catch (e) {
      Deck.setMsg(e.message);
    }
  }

  Deck.isPadActive = isPadActive;
  Deck.runPanic = runPanic;
  Deck.onPadClick = onPadClick;
})();

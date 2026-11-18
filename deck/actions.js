(() => {
  'use strict';

  const Deck = window.Deck;

  const MEDIA_ENUM = {
    play: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY',
    pause: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
    stop: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP',
    restart: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    next: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT',
    previous: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS',
  };

  function timerKey(deckId, idx) {
    return `${deckId}:${idx}`;
  }

  function isPadActive(p) {
    const { obs, cfg } = Deck;
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
    if (p.type === 'page') return (p.mode || 'goto') === 'goto' && Boolean(p.deckId && cfg.activeDeckId === p.deckId);
    if (p.type === 'studio') {
      const act = p.action || 'toggle';
      if (act === 'preview') return Boolean(obs.studioModeEnabled && p.sceneName && obs.previewScene === p.sceneName);
      if (act === 'transition') return false;
      return Boolean(obs.studioModeEnabled);
    }
    if (p.type === 'output') {
      const t = p.target || 'stream';
      if (t === 'saveReplay') return false;
      return Boolean(obs.outputs?.[t]);
    }
    if (p.type === 'media') {
      return Boolean(p.inputName && obs.mediaStates?.[p.inputName] === 'OBS_MEDIA_STATE_PLAYING');
    }
    if (p.type === 'volume') {
      if ((p.mode || 'step') !== 'set' || !p.inputName) return false;
      const cur = obs.volumes?.[p.inputName];
      return typeof cur === 'number' && Math.abs(cur - Number(p.volumeDb || 0)) < 0.25;
    }
    if (p.type === 'profile') return Boolean(p.profileName && obs.currentProfile === p.profileName);
    if (p.type === 'collection') return Boolean(p.collectionName && obs.currentCollection === p.collectionName);
    if (p.type === 'transition') return Boolean(p.transitionName && obs.currentTransition === p.transitionName);
    return false;
  }

  function triggerScreenshotDownload(dataUrl, sourceName, fmt) {
    if (!dataUrl || typeof document === 'undefined') return;
    try {
      const safeName = String(sourceName || 'obs').replace(/[^a-z0-9._-]+/gi, '_');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `screenshot-${safeName}-${Date.now()}.${fmt || 'png'}`;
      a.click();
    } catch {}
  }

  async function execAction(a) {
    const { obs, obsCall, refreshFilters, cfg } = Deck;
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
        else obs.mutes[a.inputName] = !obs.mutes[a.inputName];
      } else {
        const want = mode === 'mute';
        await obsCall('SetInputMute', { inputName: a.inputName, inputMuted: want });
        obs.mutes[a.inputName] = want;
      }
    } else if (a.type === 'page') {
      const mode = a.mode || 'goto';
      if (mode === 'next' || mode === 'prev') {
        const decks = cfg.decks || [];
        if (decks.length > 1) {
          const curIdx = Math.max(0, decks.findIndex((d) => d.id === cfg.activeDeckId));
          const delta = mode === 'next' ? 1 : -1;
          const nextDeck = decks[(curIdx + delta + decks.length) % decks.length];
          Deck.setActiveDeck(nextDeck.id);
          return;
        }
      } else if (a.deckId) {
        Deck.setActiveDeck(a.deckId);
        return;
      }
    } else if (a.type === 'studio') {
      const act = a.action || 'toggle';
      if (act === 'preview') {
        if (a.sceneName) {
          await obsCall('SetCurrentPreviewScene', { sceneName: a.sceneName });
          obs.previewScene = a.sceneName;
          Deck.updateSceneHeader();
        }
      } else if (act === 'transition') {
        await obsCall('TriggerStudioModeTransition');
      } else {
        const want = act === 'enable' ? true : act === 'disable' ? false : !obs.studioModeEnabled;
        await obsCall('SetStudioModeEnabled', { studioModeEnabled: want });
        obs.studioModeEnabled = want;
        Deck.updateSceneHeader();
      }
    } else if (a.type === 'output') {
      const t = a.target || 'stream';
      const mode = a.mode || 'toggle';
      if (t === 'saveReplay') {
        await obsCall('SaveReplayBuffer');
      } else if (t === 'stream') {
        if (mode === 'toggle') {
          const r = await obsCall('ToggleStream');
          obs.outputs.stream = typeof r.outputActive === 'boolean' ? r.outputActive : !obs.outputs.stream;
        } else {
          const want = mode === 'start';
          await obsCall(want ? 'StartStream' : 'StopStream');
          obs.outputs.stream = want;
        }
      } else if (t === 'record') {
        if (mode === 'toggle') {
          const r = await obsCall('ToggleRecord');
          obs.outputs.record = typeof r.outputActive === 'boolean' ? r.outputActive : !obs.outputs.record;
        } else {
          const want = mode === 'start';
          await obsCall(want ? 'StartRecord' : 'StopRecord');
          obs.outputs.record = want;
          if (!want) obs.outputs.recordPaused = false;
        }
      } else if (t === 'recordPause') {
        if (mode === 'toggle') {
          const r = await obsCall('ToggleRecordPause');
          obs.outputs.recordPaused = typeof r.outputPaused === 'boolean' ? r.outputPaused : !obs.outputs.recordPaused;
        } else {
          const want = mode === 'start';
          await obsCall(want ? 'PauseRecord' : 'ResumeRecord');
          obs.outputs.recordPaused = want;
        }
      } else if (t === 'vcam') {
        if (mode === 'toggle') {
          const r = await obsCall('ToggleVirtualCam');
          obs.outputs.vcam = typeof r.outputActive === 'boolean' ? r.outputActive : !obs.outputs.vcam;
        } else {
          const want = mode === 'start';
          await obsCall(want ? 'StartVirtualCam' : 'StopVirtualCam');
          obs.outputs.vcam = want;
        }
      } else if (t === 'replay') {
        if (mode === 'toggle') {
          const r = await obsCall('ToggleReplayBuffer');
          obs.outputs.replay = typeof r.outputActive === 'boolean' ? r.outputActive : !obs.outputs.replay;
        } else {
          const want = mode === 'start';
          await obsCall(want ? 'StartReplayBuffer' : 'StopReplayBuffer');
          obs.outputs.replay = want;
        }
      }
    } else if (a.type === 'media' && a.inputName) {
      const ma = a.mediaAction || 'play_pause';
      let enumAction;
      if (ma === 'play_pause') {
        if (!obs.mediaStates[a.inputName]) await Deck.fetchMediaState(a.inputName);
        const playing = obs.mediaStates[a.inputName] === 'OBS_MEDIA_STATE_PLAYING';
        enumAction = playing ? MEDIA_ENUM.pause : MEDIA_ENUM.play;
        obs.mediaStates[a.inputName] = playing ? 'OBS_MEDIA_STATE_PAUSED' : 'OBS_MEDIA_STATE_PLAYING';
      } else {
        enumAction = MEDIA_ENUM[ma] || MEDIA_ENUM.play;
        if (ma === 'play' || ma === 'restart') obs.mediaStates[a.inputName] = 'OBS_MEDIA_STATE_PLAYING';
        else if (ma === 'pause') obs.mediaStates[a.inputName] = 'OBS_MEDIA_STATE_PAUSED';
        else if (ma === 'stop') obs.mediaStates[a.inputName] = 'OBS_MEDIA_STATE_STOPPED';
      }
      await obsCall('TriggerMediaInputAction', { inputName: a.inputName, mediaAction: enumAction });
    } else if (a.type === 'screenshot') {
      const target = a.sourceName || obs.programScene;
      if (!target) throw new Error('No source or active scene for screenshot');
      const fmt = a.imageFormat || 'png';
      if (a.savePath) {
        await obsCall('SaveSourceScreenshot', { sourceName: target, imageFormat: fmt, imageFilePath: a.savePath });
      } else {
        const res = await obsCall('GetSourceScreenshot', { sourceName: target, imageFormat: fmt });
        if (res?.imageData) {
          obs.lastScreenshot = res.imageData;
          triggerScreenshotDownload(res.imageData, target, fmt);
        }
      }
    } else if (a.type === 'browser' && a.inputName) {
      if ((a.mode || 'refresh') === 'set_url') {
        await obsCall('SetInputSettings', { inputName: a.inputName, inputSettings: { url: a.url || '' }, overlay: true });
      } else {
        await obsCall('PressInputPropertiesButton', { inputName: a.inputName, propertyName: 'refreshnocache' });
      }
    } else if (a.type === 'volume' && a.inputName) {
      const mode = a.mode || 'step';
      const val = Number(a.volumeDb);
      let nextDb;
      if (mode === 'set') {
        nextDb = Math.max(-100, Math.min(26, Number.isFinite(val) ? val : 0));
      } else {
        let cur = obs.volumes[a.inputName];
        if (typeof cur !== 'number') cur = await Deck.fetchVolume(a.inputName);
        const delta = Number.isFinite(val) ? val : -3;
        nextDb = Math.max(-100, Math.min(26, Math.round((cur + delta) * 10) / 10));
      }
      await obsCall('SetInputVolume', { inputName: a.inputName, inputVolumeDb: nextDb });
      obs.volumes[a.inputName] = nextDb;
    } else if (a.type === 'profile' && a.profileName) {
      await obsCall('SetCurrentProfile', { profileName: a.profileName });
      obs.currentProfile = a.profileName;
    } else if (a.type === 'collection' && a.collectionName) {
      await obsCall('SetCurrentSceneCollection', { sceneCollectionName: a.collectionName });
      obs.currentCollection = a.collectionName;
    } else if (a.type === 'transition' && a.transitionName) {
      await obsCall('SetCurrentSceneTransition', { transitionName: a.transitionName });
      obs.currentTransition = a.transitionName;
      if (a.durationMs != null && Number.isFinite(Number(a.durationMs))) {
        const dur = Math.max(0, Math.round(Number(a.durationMs)));
        await obsCall('SetCurrentSceneTransitionDuration', { transitionDuration: dur });
        obs.transitionDuration = dur;
      }
    }

    Deck.renderGrid();
  }

  function buildAutoOffReverse(p) {
    if (!p) return null;
    if (p.type === 'source') return { type: 'source', sceneName: p.sceneName, sourceName: p.sourceName, mode: 'hide' };
    if (p.type === 'filter') return { type: 'filter', sourceName: p.sourceName, filterName: p.filterName, mode: 'disable' };
    if (p.type === 'mute') return { type: 'mute', inputName: p.inputName, mode: 'unmute' };
    if (p.type === 'studio') return { type: 'studio', action: 'disable' };
    if (p.type === 'output' && p.target !== 'saveReplay') return { type: 'output', target: p.target, mode: 'stop' };
    if (p.type === 'media') {
      const ma = p.mediaAction === 'restart' ? 'stop' : 'pause';
      return { type: 'media', inputName: p.inputName, mediaAction: ma };
    }
    return null;
  }

  function isTurnOnAction(p, wasActive) {
    if (!p || !(p.autoOffMs > 0)) return false;
    if (p.type === 'source') {
      const m = p.mode || 'toggle';
      return m === 'show' || m === 'solo' || (m === 'toggle' && !wasActive);
    }
    if (p.type === 'filter') {
      const m = p.mode || 'toggle';
      return m === 'enable' || (m === 'toggle' && !wasActive);
    }
    if (p.type === 'mute') {
      const m = p.mode || 'toggle';
      return m === 'mute' || (m === 'toggle' && !wasActive);
    }
    if (p.type === 'studio') {
      const act = p.action || 'toggle';
      return act === 'enable' || (act === 'toggle' && !wasActive);
    }
    if (p.type === 'output') {
      if (p.target === 'saveReplay') return false;
      const m = p.mode || 'toggle';
      return m === 'start' || (m === 'toggle' && !wasActive);
    }
    if (p.type === 'media') {
      const ma = p.mediaAction || 'play_pause';
      return ma === 'play' || ma === 'restart' || (ma === 'play_pause' && !wasActive);
    }
    return false;
  }

  function abortAutoOff(key) {
    const t = Deck.activeAutoOffs.get(key);
    if (!t) return false;
    t.aborted = true;
    clearTimeout(t.waitTimer);
    clearInterval(t.tickTimer);
    Deck.activeAutoOffs.delete(key);
    return true;
  }

  function startAutoOff(key, deckId, idx, pad) {
    abortAutoOff(key);
    const ms = Math.max(1, Number(pad.autoOffMs) || 0);
    const reverse = buildAutoOffReverse(pad);
    if (!reverse) return;
    const ctx = {
      deckId,
      idx,
      aborted: false,
      endsAt: Date.now() + ms,
      waitTimer: null,
      tickTimer: null,
    };
    Deck.activeAutoOffs.set(key, ctx);
    Deck.updateMacroTicks();
    ctx.tickTimer = setInterval(() => Deck.updateMacroTicks(), 200);
    ctx.waitTimer = setTimeout(async () => {
      clearInterval(ctx.tickTimer);
      if (Deck.activeAutoOffs.get(key) === ctx) Deck.activeAutoOffs.delete(key);
      if (ctx.aborted) return;
      try {
        await execAction(reverse);
        Deck.setMsg(`Auto-off: ${pad.label || pad.filterName || pad.sourceName || pad.inputName || pad.type}`);
      } catch (e) {
        Deck.setMsg(`Auto-off error: ${e.message}`);
        Deck.renderGrid();
      }
    }, ms);
    Deck.renderGrid();
  }

  function abortMacro(key) {
    const m = Deck.activeMacros.get(key);
    if (!m) return false;
    m.aborted = true;
    clearTimeout(m.waitTimer);
    clearInterval(m.tickTimer);
    if (m.resolveWait) m.resolveWait();
    Deck.activeMacros.delete(key);
    return true;
  }

  Deck.abortDeckTimers = (deckId) => {
    const prefix = `${deckId}:`;
    for (const k of [...Deck.activeMacros.keys()]) if (k.startsWith(prefix)) abortMacro(k);
    for (const k of [...Deck.activeAutoOffs.keys()]) if (k.startsWith(prefix)) abortAutoOff(k);
  };

  Deck.getPadRuntime = (idx, deckId = Deck.cfg.activeDeckId) => {
    const key = timerKey(deckId, idx);
    const macro = Deck.activeMacros.get(key);
    if (macro) return { running: true, kind: 'macro', endsAt: macro.endsAt || 0 };
    const autoOff = Deck.activeAutoOffs.get(key);
    if (autoOff) return { running: true, kind: 'autoOff', endsAt: autoOff.endsAt || 0 };
    return { running: false, kind: null, endsAt: 0 };
  };

  Deck.getActiveDeckTicks = () => {
    const activeId = Deck.cfg.activeDeckId;
    const out = [];
    for (const m of Deck.activeMacros.values()) {
      if (m.deckId === activeId) out.push({ idx: m.idx, kind: 'macro', endsAt: m.endsAt || 0 });
    }
    for (const t of Deck.activeAutoOffs.values()) {
      if (t.deckId === activeId) out.push({ idx: t.idx, kind: 'autoOff', endsAt: t.endsAt || 0 });
    }
    return out;
  };

  async function runMacro(idx, pad, deckId) {
    const { activeMacros, setMsg } = Deck;
    const key = timerKey(deckId, idx);
    if (activeMacros.has(key)) {
      abortMacro(key);
      setMsg(`Cancelled macro: ${pad.label || `Pad ${idx + 1}`}`);
      Deck.renderGrid();
      return;
    }
    const steps = pad.steps || [];
    if (!steps.length) return;
    const ctx = { deckId, idx, aborted: false, waitTimer: null, tickTimer: null, endsAt: 0, resolveWait: null };
    activeMacros.set(key, ctx);
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
      if (activeMacros.get(key) === ctx) activeMacros.delete(key);
      Deck.renderGrid();
    }
  }

  async function runPanic() {
    const { activeMacros, activeAutoOffs, cfg, obs, obsCall, setMsg } = Deck;
    const runningMacros = [...activeMacros.keys()];
    runningMacros.forEach(abortMacro);
    const runningTimers = [...activeAutoOffs.keys()];
    runningTimers.forEach(abortAutoOff);
    let ran = 0;
    const errs = [];
    if ((cfg.panicSteps || []).length) {
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
      for (const d of cfg.decks) {
        for (const p of d.pads) {
          collect(p);
          (p.steps || []).forEach(collect);
        }
      }
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
    const stoppedCount = runningMacros.length + runningTimers.length;
    setMsg(
      `PANIC executed (${stoppedCount} timer/macro(s) stopped, ${ran} reset action(s))`
      + (errs.length ? ` — ${errs.length} error(s): ${errs[0]}` : '')
    );
    Deck.renderGrid();
  }

  function describePad(p) {
    return p.label || p.sceneName || p.filterName || p.sourceName || p.inputName
      || p.profileName || p.collectionName || p.transitionName || p.target || p.type;
  }

  async function onPadClick(idx, deckId = Deck.cfg.activeDeckId) {
    if (Deck.editMode) { Deck.openPadEditor(idx); return; }
    const deck = Deck.cfg.decks.find((d) => d.id === deckId) || Deck.getActiveDeck();
    const p = deck.pads[idx];
    if (!p || p.type === 'none') { Deck.openPadEditor(idx); return; }
    if (p.type === 'panic') { await runPanic(); return; }
    if (p.type === 'macro') { await runMacro(idx, p, deck.id); return; }

    const key = timerKey(deck.id, idx);
    if (Deck.activeAutoOffs.has(key)) {
      abortAutoOff(key);
      if (isPadActive(p)) {
        const rev = buildAutoOffReverse(p);
        if (rev) {
          try {
            await execAction(rev);
            Deck.setMsg(`Cancelled & turned off: ${describePad(p)}`);
            return;
          } catch (e) {
            Deck.setMsg(e.message);
          }
        }
      }
      Deck.setMsg(`Cancelled timer: ${describePad(p)}`);
      Deck.renderGrid();
      return;
    }

    const wasActive = isPadActive(p);
    try {
      await execAction(p);
      if (isTurnOnAction(p, wasActive)) {
        startAutoOff(key, deck.id, idx, p);
      }
      Deck.setMsg(`Ran: ${describePad(p)}`);
    } catch (e) {
      Deck.setMsg(e.message);
    }
  }

  Deck.findPadByHotkey = (hotkeyOrEvent, deck = Deck.getActiveDeck()) => {
    const target = typeof hotkeyOrEvent === 'string'
      ? Deck.normalizeHotkey(hotkeyOrEvent)
      : Deck.hotkeyFromEvent(hotkeyOrEvent);
    if (!target || !deck) return null;
    for (let i = 0; i < deck.pads.length; i++) {
      const p = deck.pads[i];
      if (p && p.type !== 'none' && p.hotkey && Deck.normalizeHotkey(p.hotkey) === target) {
        return { deck, idx: i, pad: p };
      }
    }
    return null;
  };

  Deck.handleKeyDown = (ev) => {
    if (!ev || ev.repeat || Deck.editMode) return false;
    if (typeof document !== 'undefined') {
      if (document.querySelector('dialog[open]')) return false;
      const el = ev.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
    }
    const match = Deck.findPadByHotkey(ev);
    if (!match) return false;
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    Deck.onPadClick(match.idx, match.deck.id);
    return true;
  };

  Deck.isPadActive = isPadActive;
  Deck.execAction = execAction;
  Deck.runPanic = runPanic;
  Deck.onPadClick = onPadClick;
})();

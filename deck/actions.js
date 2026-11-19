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

  function timerKey(pageId, idx) {
    return `${pageId}:${idx}`;
  }

  function isPadActive(p) {
    const { obs, cfg } = Deck;
    if (!p || p.type === 'none') return false;
    if (p.type === 'scene') {
      return (p.mode || 'named') === 'named' && Boolean(p.sceneName && obs.programScene === p.sceneName);
    }
    if (p.type === 'source') {
      const items = obs.itemsByScene[p.sceneName] || [];
      return items.some((it) => it.sourceName === p.sourceName && it.sceneItemEnabled);
    }
    if (p.type === 'filter') {
      const flts = obs.filtersBySource[p.sourceName] || [];
      return flts.some((f) => f.filterName === p.filterName && f.filterEnabled);
    }
    if (p.type === 'mute') return Boolean(p.inputName && obs.mutes[p.inputName]);
    if (p.type === 'monitor') {
      if (!p.inputName) return false;
      const cur = obs.monitors?.[p.inputName];
      if ((p.monitorType || 'cycle') === 'cycle') {
        return cur === 'OBS_MONITORING_TYPE_MONITOR_ONLY' || cur === 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT';
      }
      return cur === p.monitorType;
    }
    if (p.type === 'transform') {
      if (!p.sceneName || !p.sourceName) return false;
      const state = obs.transforms?.[`${p.sceneName}\0${p.sourceName}`];
      if (!state) return false;
      if ((p.preset || 'toggle_pip') === 'toggle_pip') return state !== 'full_reset';
      return state === p.preset;
    }
    if (p.type === 'image') {
      if ((p.mode || 'set_file') !== 'set_file') return false;
      return Boolean(p.inputName && p.filePath && obs.imageFiles?.[p.inputName] === p.filePath);
    }
    if (p.type === 'page') {
      const pid = p.pageId || p.deckId;
      return (p.mode || 'goto') === 'goto' && Boolean(pid && cfg.activePageId === pid);
    }
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

  async function getSceneItems(sceneName) {
    const { obs, obsCall } = Deck;
    let items = obs.itemsByScene[sceneName];
    if (!items) {
      const req = obs.groups.has(sceneName) ? 'GetGroupSceneItemList' : 'GetSceneItemList';
      items = (await obsCall(req, { sceneName })).sceneItems || [];
      obs.itemsByScene[sceneName] = items;
    }
    return items;
  }

  function computeTransformPreset(cur, preset, videoSettings) {
    const baseW = Number(videoSettings?.baseWidth) || 1920;
    const baseH = Number(videoSettings?.baseHeight) || 1080;
    const srcW = Number(cur?.sourceWidth) || baseW;
    const srcH = Number(cur?.sourceHeight) || baseH;
    const effW = Math.max(1, srcW - (Number(cur?.cropLeft) || 0) - (Number(cur?.cropRight) || 0));
    const effH = Math.max(1, srcH - (Number(cur?.cropTop) || 0) - (Number(cur?.cropBottom) || 0));

    let effectivePreset = preset || 'toggle_pip';
    if (effectivePreset === 'toggle_pip') {
      const curScaleX = Number(cur?.scaleX) || 1;
      effectivePreset = (effW * curScaleX) < baseW * 0.6 ? 'full_reset' : 'pip_br';
    }

    if (effectivePreset === 'full_reset') {
      const fullScale = Math.min(baseW / effW, baseH / effH);
      const fw = effW * fullScale;
      const fh = effH * fullScale;
      return {
        effectivePreset,
        sceneItemTransform: {
          alignment: 5,
          positionX: Math.round((baseW - fw) / 2),
          positionY: Math.round((baseH - fh) / 2),
          scaleX: fullScale,
          scaleY: fullScale,
          rotation: 0,
        },
      };
    }

    if (effectivePreset === 'center_half') {
      const halfScale = Math.min((baseW * 0.5) / effW, (baseH * 0.5) / effH);
      const hw = effW * halfScale;
      const hh = effH * halfScale;
      return {
        effectivePreset,
        sceneItemTransform: {
          alignment: 5,
          positionX: Math.round((baseW - hw) / 2),
          positionY: Math.round((baseH - hh) / 2),
          scaleX: halfScale,
          scaleY: halfScale,
        },
      };
    }

    const margin = Math.round(Math.min(baseW, baseH) * 0.03);
    const pipScale = Math.min((baseW * 0.28) / effW, (baseH * 0.28) / effH);
    const pipW = effW * pipScale;
    const pipH = effH * pipScale;
    const isRight = effectivePreset === 'pip_tr' || effectivePreset === 'pip_br';
    const isBottom = effectivePreset === 'pip_bl' || effectivePreset === 'pip_br';

    return {
      effectivePreset,
      sceneItemTransform: {
        alignment: 5,
        positionX: isRight ? Math.round(baseW - pipW - margin) : margin,
        positionY: isBottom ? Math.round(baseH - pipH - margin) : margin,
        scaleX: pipScale,
        scaleY: pipScale,
      },
    };
  }

  function deriveTransformPreset(cur, videoSettings) {
    if (!cur) return 'full_reset';
    const baseW = Number(videoSettings?.baseWidth) || 1920;
    const baseH = Number(videoSettings?.baseHeight) || 1080;
    const srcW = Number(cur?.sourceWidth) || baseW;
    const srcH = Number(cur?.sourceHeight) || baseH;
    const effW = Math.max(1, srcW - (Number(cur?.cropLeft) || 0) - (Number(cur?.cropRight) || 0));
    const effH = Math.max(1, srcH - (Number(cur?.cropTop) || 0) - (Number(cur?.cropBottom) || 0));
    const curScaleX = Number.isFinite(Number(cur?.scaleX)) && Number(cur?.scaleX) > 0 ? Number(cur?.scaleX) : 1;
    const curScaleY = Number.isFinite(Number(cur?.scaleY)) && Number(cur?.scaleY) > 0 ? Number(cur?.scaleY) : 1;
    const curW = effW * curScaleX;
    const curH = effH * curScaleY;

    if (curW >= baseW * 0.6) {
      return 'full_reset';
    }

    const centerX = (baseW - curW) / 2;
    const centerY = (baseH - curH) / 2;
    if (Math.abs(Number(cur.positionX) - centerX) < 20 && Math.abs(Number(cur.positionY) - centerY) < 20) {
      return 'center_half';
    }

    const isRight = Number(cur.positionX) > (baseW - curW) / 2;
    const isBottom = Number(cur.positionY) > (baseH - curH) / 2;
    if (isRight && isBottom) return 'pip_br';
    if (isRight && !isBottom) return 'pip_tr';
    if (!isRight && isBottom) return 'pip_bl';
    return 'pip_tl';
  }

  async function fetchTransform(sceneName, sourceName) {
    const { obs, obsCall } = Deck;
    if (!sceneName || !sourceName) return '';
    try {
      const items = await getSceneItems(sceneName);
      const item = (items || []).find((it) => it.sourceName === sourceName);
      if (!item) return '';
      const trRes = await obsCall('GetSceneItemTransform', {
        sceneName,
        sceneItemId: item.sceneItemId,
      });
      const cur = trRes.sceneItemTransform || trRes || {};
      const derived = deriveTransformPreset(cur, obs.videoSettings);
      obs.transforms[`${sceneName}\0${sourceName}`] = derived;
      return derived;
    } catch {}
    return '';
  }

  async function syncTransforms() {
    const { obs, cfg } = Deck;
    if (!obs || !cfg) return;
    const targets = new Set();
    const collect = (st) => {
      if (st?.type === 'transform' && st.sceneName && st.sourceName) {
        targets.add(`${st.sceneName}\0${st.sourceName}`);
      }
    };
    for (const d of (cfg.pages || [])) {
      for (const p of (d.pads || [])) {
        collect(p);
        (p.steps || []).forEach(collect);
      }
    }
    (cfg.panicSteps || []).forEach(collect);

    await Promise.all([...targets].map(async (key) => {
      const idx = key.indexOf('\0');
      const sceneName = key.slice(0, idx);
      const sourceName = key.slice(idx + 1);
      try {
        await fetchTransform(sceneName, sourceName);
      } catch {}
    }));
    Deck.renderGrid();
  }

  Deck.syncTransforms = syncTransforms;

  async function execAction(a) {
    const { obs, obsCall, refreshFilters, cfg } = Deck;
    if (!a || a.type === 'none' || a.type === 'wait') return;

    if (a.type === 'scene') {
      const mode = a.mode || 'named';
      if (mode === 'next' || mode === 'prev') {
        const scenes = obs.scenes || [];
        if (!scenes.length) throw new Error('No scenes available');
        const curIdx = scenes.indexOf(obs.programScene);
        const delta = mode === 'next' ? 1 : -1;
        const target = curIdx < 0 ? scenes[0] : scenes[(curIdx + delta + scenes.length) % scenes.length];
        await obsCall('SetCurrentProgramScene', { sceneName: target });
        obs.programScene = target;
        Deck.updateSceneHeader();
      } else if (a.sceneName) {
        await obsCall('SetCurrentProgramScene', { sceneName: a.sceneName });
        obs.programScene = a.sceneName;
        Deck.updateSceneHeader();
      }
    } else if (a.type === 'source' && a.sceneName && a.sourceName) {
      const items = await getSceneItems(a.sceneName);
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
    } else if (a.type === 'monitor' && a.inputName) {
      const mt = a.monitorType || 'cycle';
      let nextType = mt;
      if (mt === 'cycle') {
        let cur = obs.monitors[a.inputName];
        if (!cur) cur = await Deck.fetchMonitorType(a.inputName);
        const order = Deck.MONITOR_TYPES;
        const idx = order.indexOf(cur);
        nextType = order[(idx + 1) % order.length];
      }
      await obsCall('SetInputAudioMonitorType', { inputName: a.inputName, monitorType: nextType });
      obs.monitors[a.inputName] = nextType;
    } else if (a.type === 'transform' && a.sceneName && a.sourceName) {
      const items = await getSceneItems(a.sceneName);
      const item = items.find((it) => it.sourceName === a.sourceName);
      if (!item) throw new Error(`Source "${a.sourceName}" not in "${a.sceneName}"`);
      const trRes = await obsCall('GetSceneItemTransform', {
        sceneName: a.sceneName,
        sceneItemId: item.sceneItemId,
      });
      const cur = trRes.sceneItemTransform || trRes || {};
      const { effectivePreset, sceneItemTransform } = computeTransformPreset(cur, a.preset, obs.videoSettings);
      await obsCall('SetSceneItemTransform', {
        sceneName: a.sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemTransform,
      });
      obs.transforms[`${a.sceneName}\0${a.sourceName}`] = effectivePreset;
    } else if (a.type === 'image' && a.inputName) {
      const mode = a.mode || 'set_file';
      if (mode === 'set_file') {
        let kind = obs.inputKinds?.[a.inputName];
        if (!kind) {
          try {
            const s = await obsCall('GetInputSettings', { inputName: a.inputName });
            kind = s?.inputKind || '';
            if (kind) obs.inputKinds[a.inputName] = kind;
          } catch {}
        }
        const isSlideshow = /slideshow/i.test(kind || '');
        const inputSettings = isSlideshow
          ? { files: a.filePath ? [{ value: a.filePath, hidden: false, selected: false }] : [] }
          : { file: a.filePath || '' };
        await obsCall('SetInputSettings', {
          inputName: a.inputName,
          inputSettings,
          overlay: true,
        });
        obs.imageFiles[a.inputName] = a.filePath || '';
      } else {
        const enumAction = MEDIA_ENUM[mode] || MEDIA_ENUM.restart;
        await obsCall('TriggerMediaInputAction', { inputName: a.inputName, mediaAction: enumAction });
      }
    } else if (a.type === 'hotkey' && a.hotkeyName) {
      await obsCall('TriggerHotkeyByName', { hotkeyName: a.hotkeyName });
    } else if (a.type === 'chapter') {
      const data = a.chapterName ? { chapterName: a.chapterName } : {};
      await obsCall('CreateRecordChapter', data);
    } else if (a.type === 'stats') {
      await Deck.fetchStats();
      return;
    } else if (a.type === 'page') {
      const mode = a.mode || 'goto';
      if (mode === 'next' || mode === 'prev') {
        const pages = cfg.pages || [];
        if (pages.length > 1) {
          const curIdx = Math.max(0, pages.findIndex((d) => d.id === cfg.activePageId));
          const delta = mode === 'next' ? 1 : -1;
          const nextPage = pages[(curIdx + delta + pages.length) % pages.length];
          Deck.setActivePage(nextPage.id);
          return;
        }
      } else {
        const targetId = a.pageId || a.deckId;
        if (targetId) {
          Deck.setActivePage(targetId);
          return;
        }
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

  function startAutoOff(key, pageId, idx, pad) {
    abortAutoOff(key);
    const ms = Math.max(1, Number(pad.autoOffMs) || 0);
    const reverse = buildAutoOffReverse(pad);
    if (!reverse) return;
    const ctx = {
      pageId,
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

  Deck.busyPads = Deck.busyPads || new Set();
  Deck.armedPads = Deck.armedPads || new Map();

  const OUTPUT_TARGET_LABELS = {
    stream: 'Stream',
    record: 'Record',
    vcam: 'Virtual Cam',
    replay: 'Replay Buffer',
  };

  function isOutputStopAction(p) {
    if (!p || p.type !== 'output') return false;
    const t = p.target || 'stream';
    if (!['stream', 'record', 'vcam', 'replay'].includes(t)) return false;
    const m = p.mode || 'toggle';
    if (m !== 'toggle' && m !== 'stop') return false;
    return Boolean(Deck.obs?.outputs?.[t]);
  }

  function disarmPad(key) {
    const armed = Deck.armedPads.get(key);
    if (!armed) return false;
    clearTimeout(armed.timer);
    Deck.armedPads.delete(key);
    const [pageId, idxStr] = key.split(':');
    if (Deck.cfg?.activePageId === pageId) {
      const grid = Deck.$ ? Deck.$('grid') : document.getElementById('grid');
      if (grid) {
        const btn = grid.querySelector(`.pad[data-idx="${idxStr}"]`);
        if (btn) btn.classList.remove('armed');
      }
    }
    return true;
  }

  function armPad(pageId, idx, p) {
    const key = timerKey(pageId, idx);
    disarmPad(key);
    const ctx = {
      pageId,
      idx,
      expiresAt: Date.now() + 2000,
      timer: setTimeout(() => {
        disarmPad(key);
      }, 2000),
    };
    Deck.armedPads.set(key, ctx);
    if (Deck.cfg?.activePageId === pageId) {
      const grid = Deck.$ ? Deck.$('grid') : document.getElementById('grid');
      if (grid) {
        const btn = grid.querySelector(`.pad[data-idx="${idx}"]`);
        if (btn) btn.classList.add('armed');
      }
    }
    const t = p.target || 'stream';
    const label = p.label || OUTPUT_TARGET_LABELS[t] || t;
    Deck.setMsg(`Armed: tap again or hold to stop ${label}`);
  }

  Deck.heldPads = Deck.heldPads || new Map();
  Deck.pendingHoldRestores = Deck.pendingHoldRestores || [];

  function isPadHeld(idx, pageId = Deck.cfg.activePageId) {
    return Deck.heldPads.has(timerKey(pageId, idx));
  }

  async function holdPress(idx, pageId = Deck.cfg.activePageId) {
    if (Deck.editMode) return;
    const page = Deck.cfg.pages.find((d) => d.id === pageId) || Deck.getActivePage();
    const p = page?.pads?.[idx];
    if (!p || p.type === 'none' || !p.hold || !Deck.HOLD_TYPES || !Deck.HOLD_TYPES.has(p.type)) return;

    const key = timerKey(page.id, idx);
    if (Deck.heldPads.has(key)) return;

    let origState = false;
    let restoreAction = null;

    if (p.type === 'mute') {
      origState = Boolean(Deck.obs?.mutes?.[p.inputName]);
      restoreAction = { type: 'mute', inputName: p.inputName, mode: origState ? 'mute' : 'unmute' };
    } else if (p.type === 'source') {
      let items = Deck.obs?.itemsByScene?.[p.sceneName];
      if (!items && Deck.obs?.status === 'ok') {
        try { items = await getSceneItems(p.sceneName); } catch {}
      }
      const it = (items || []).find((x) => x.sourceName === p.sourceName);
      origState = Boolean(it?.sceneItemEnabled);
      restoreAction = { type: 'source', sceneName: p.sceneName, sourceName: p.sourceName, mode: origState ? 'show' : 'hide' };
    } else if (p.type === 'filter') {
      let flts = Deck.obs?.filtersBySource?.[p.sourceName];
      if (!flts && Deck.obs?.status === 'ok') {
        try { flts = await Deck.refreshFilters(p.sourceName); } catch {}
      }
      const f = (flts || []).find((x) => x.filterName === p.filterName);
      origState = Boolean(f?.filterEnabled);
      restoreAction = { type: 'filter', sourceName: p.sourceName, filterName: p.filterName, mode: origState ? 'enable' : 'disable' };
    }

    const entry = {
      pageId: page.id,
      idx,
      pad: p,
      origState,
      restoreAction,
      pressPromise: null,
    };
    Deck.heldPads.set(key, entry);
    if (Deck.cfg?.activePageId === page.id) {
      Deck.renderPad(idx, page);
    }

    try {
      entry.pressPromise = execAction(p);
      await entry.pressPromise;
    } catch (e) {
      Deck.setMsg?.(e.message);
    }
  }

  async function releaseHold(key) {
    const entry = Deck.heldPads.get(key);
    if (!entry) return;
    Deck.heldPads.delete(key);

    const page = Deck.cfg.pages.find((d) => d.id === entry.pageId) || Deck.getActivePage();
    if (Deck.cfg?.activePageId === entry.pageId) {
      Deck.renderPad(entry.idx, page);
    }

    if (entry.pressPromise) {
      try { await entry.pressPromise; } catch {}
    }

    if (entry.restoreAction) {
      try {
        if (Deck.obs?.ws && Deck.obs.ws.readyState === 1) {
          await execAction(entry.restoreAction);
        } else {
          Deck.pendingHoldRestores.push(entry.restoreAction);
        }
      } catch (e) {
        Deck.pendingHoldRestores.push(entry.restoreAction);
      }
    }
  }

  async function holdRelease(idx, pageId = Deck.cfg.activePageId) {
    const key = timerKey(pageId, idx);
    await releaseHold(key);
  }

  async function releaseAllHeld() {
    if (!Deck.heldPads || Deck.heldPads.size === 0) return;
    const keys = [...Deck.heldPads.keys()];
    await Promise.all(keys.map(releaseHold));
  }

  Deck.abortPadTimer = (pageId, idx) => {
    const key = timerKey(pageId, idx);
    abortMacro(key);
    abortAutoOff(key);
    disarmPad(key);
    releaseHold(key);
  };

  Deck.abortPageTimers = (pageId) => {
    const prefix = `${pageId}:`;
    for (const k of [...Deck.activeMacros.keys()]) if (k.startsWith(prefix)) abortMacro(k);
    for (const k of [...Deck.activeAutoOffs.keys()]) if (k.startsWith(prefix)) abortAutoOff(k);
    for (const k of [...Deck.armedPads.keys()]) if (k.startsWith(prefix)) disarmPad(k);
    for (const k of [...Deck.heldPads.keys()]) if (k.startsWith(prefix)) releaseHold(k);
  };

  Deck.getPadRuntime = (idx, pageId = Deck.cfg.activePageId) => {
    const key = timerKey(pageId, idx);
    const macro = Deck.activeMacros.get(key);
    if (macro) return { running: true, kind: 'macro', endsAt: macro.endsAt || 0 };
    const autoOff = Deck.activeAutoOffs.get(key);
    if (autoOff) return { running: true, kind: 'autoOff', endsAt: autoOff.endsAt || 0 };
    const armed = Deck.armedPads.get(key);
    if (armed) return { running: false, armed: true, kind: 'armed', endsAt: armed.expiresAt || 0 };
    return { running: false, kind: null, endsAt: 0 };
  };

  Deck.getActivePageTicks = () => {
    const activeId = Deck.cfg.activePageId;
    const out = [];
    for (const m of Deck.activeMacros.values()) {
      if (m.pageId === activeId) out.push({ idx: m.idx, kind: 'macro', endsAt: m.endsAt || 0 });
    }
    for (const t of Deck.activeAutoOffs.values()) {
      if (t.pageId === activeId) out.push({ idx: t.idx, kind: 'autoOff', endsAt: t.endsAt || 0 });
    }
    return out;
  };

  async function runMacro(idx, pad, pageId) {
    const { activeMacros, setMsg } = Deck;
    const key = timerKey(pageId, idx);
    if (activeMacros.has(key)) {
      abortMacro(key);
      setMsg(`Cancelled macro: ${pad.label || `Pad ${idx + 1}`}`);
      Deck.renderGrid();
      return;
    }
    const steps = pad.steps || [];
    if (!steps.length) return;
    const ctx = { pageId, idx, aborted: false, waitTimer: null, tickTimer: null, endsAt: 0, resolveWait: null };
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
    const { activeMacros, activeAutoOffs, armedPads, cfg, obs, obsCall, setMsg } = Deck;
    const runningMacros = [...activeMacros.keys()];
    runningMacros.forEach(abortMacro);
    const runningTimers = [...activeAutoOffs.keys()];
    runningTimers.forEach(abortAutoOff);
    if (armedPads) {
      const runningArmed = [...armedPads.keys()];
      runningArmed.forEach(disarmPad);
    }
    if (Deck.heldPads) {
      const runningHeld = [...Deck.heldPads.keys()];
      await Promise.all(runningHeld.map(releaseHold));
    }
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
      for (const d of cfg.pages) {
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
    if (p.type === 'scene' && (p.mode === 'next' || p.mode === 'prev')) {
      return p.label || (p.mode === 'next' ? 'Next Scene' : 'Prev Scene');
    }
    if (p.type === 'stats') return p.label || Deck.formatStatsText(p.mode);
    return p.label || p.sceneName || p.filterName || p.sourceName || p.inputName
      || p.hotkeyName || p.chapterName || p.profileName || p.collectionName
      || p.transitionName || p.preset || p.target || p.type;
  }

  async function onPadClick(idx, pageId = Deck.cfg.activePageId, opts = {}) {
    if (Deck.editMode) { Deck.openPadEditor(idx); return; }
    const page = Deck.cfg.pages.find((d) => d.id === pageId) || Deck.getActivePage();
    const p = page.pads[idx];
    if (!p || p.type === 'none') { Deck.openPadEditor(idx); return; }
    if (p.type === 'panic') { await runPanic(); return; }
    if (p.type === 'macro') { await runMacro(idx, p, page.id); return; }

    const key = timerKey(page.id, idx);
    if (Deck.busyPads.has(key)) return;

    if (p.hold && Deck.HOLD_TYPES && Deck.HOLD_TYPES.has(p.type)) {
      if (Deck.heldPads.has(key)) {
        await holdRelease(idx, page.id);
      } else {
        await holdPress(idx, page.id);
        await holdRelease(idx, page.id);
      }
      return;
    }

    if (Deck.activeAutoOffs.has(key)) {
      abortAutoOff(key);
      if (isPadActive(p)) {
        const rev = buildAutoOffReverse(p);
        if (rev) {
          try {
            Deck.busyPads.add(key);
            await execAction(rev);
            Deck.setMsg(`Cancelled & turned off: ${describePad(p)}`);
            return;
          } catch (e) {
            Deck.setMsg(e.message);
          } finally {
            Deck.busyPads.delete(key);
          }
        }
      }
      Deck.setMsg(`Cancelled timer: ${describePad(p)}`);
      Deck.renderGrid();
      return;
    }

    if (isOutputStopAction(p) && !opts.hold) {
      if (!Deck.armedPads.has(key)) {
        armPad(page.id, idx, p);
        return;
      }
      disarmPad(key);
    } else if (Deck.armedPads.has(key)) {
      disarmPad(key);
    }

    const wasActive = isPadActive(p);
    try {
      Deck.busyPads.add(key);
      await execAction(p);
      if (isTurnOnAction(p, wasActive)) {
        startAutoOff(key, page.id, idx, p);
      }
      Deck.setMsg(`Ran: ${describePad(p)}`);
    } catch (e) {
      Deck.setMsg(e.message);
    } finally {
      Deck.busyPads.delete(key);
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('blur', () => {
      if (Deck.heldPads && Deck.heldPads.size > 0) {
        releaseAllHeld();
      }
    });
  }

  Deck.handleKeyDown = () => false;

  Deck.isPadActive = isPadActive;
  Deck.isPadArmed = (idx, pageId = Deck.cfg.activePageId) => {
    return Deck.armedPads.has(timerKey(pageId, idx));
  };
  Deck.isOutputStopAction = isOutputStopAction;
  Deck.armPad = armPad;
  Deck.disarmPad = disarmPad;
  Deck.execAction = execAction;
  Deck.runPanic = runPanic;
  Deck.onPadClick = onPadClick;
  Deck.holdPress = holdPress;
  Deck.holdRelease = holdRelease;
  Deck.releaseAllHeld = releaseAllHeld;
  Deck.isPadHeld = isPadHeld;
})();

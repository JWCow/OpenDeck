import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

export const PASSWORD = 's3cr3t-vệt';
export const SALT = 'NaCl-muối';
export const CHALLENGE = 'Ch4ll3ng3';
const b64sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
const EXPECTED_AUTH = b64sha(b64sha(PASSWORD + SALT) + CHALLENGE);

const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export function createFakeObs(requireAuth = true, host = '127.0.0.1') {
  const state = {
    programScene: 'Main Cam',
    previewScene: 'Slides',
    studioModeEnabled: false,
    scenes: ['BRB', 'Slides', 'Main Cam', '<img src=x onerror="window.__xss=1"> #cam'],
    inputs: ['Webcam', 'Mic/Aux', 'Desktop Audio', 'Intro Video', 'Alert Overlay', 'Slide Image', 'Photo Slideshow', 'Title Text', 'Ticker File'],
    inputKinds: {
      'Webcam': 'dshow_input',
      'Mic/Aux': 'wasapi_input_capture',
      'Desktop Audio': 'wasapi_output_capture',
      'Intro Video': 'ffmpeg_source',
      'Alert Overlay': 'browser_source',
      'Slide Image': 'image_source',
      'Photo Slideshow': 'slideshow',
      'Title Text': 'text_gdiplus_v2',
      'Ticker File': 'text_ft2_source_v2',
    },
    inputSettings: {
      'Alert Overlay': { url: 'https://example.com/alerts' },
      'Slide Image': { file: '/img/slide1.png' },
      'Photo Slideshow': { files: [{ value: '/img/slide1.png', hidden: false, selected: false }] },
      'Title Text': { text: 'Initial Title', read_from_file: false },
      'Ticker File': { text: 'From File', read_from_file: true },
    },
    sceneItems: {
      'Main Cam': [
        { sceneItemId: 1, sourceName: 'Webcam', sceneItemEnabled: true, isGroup: false },
        { sceneItemId: 2, sourceName: 'Lower Third', sceneItemEnabled: false, isGroup: false },
        { sceneItemId: 10, sourceName: 'Cam Group', sceneItemEnabled: true, isGroup: true },
      ],
      'Slides': [{ sceneItemId: 3, sourceName: 'Deck Slides', sceneItemEnabled: true, isGroup: false }],
      'BRB': [],
      '<img src=x onerror="window.__xss=1"> #cam': [],
    },
    groupItems: {
      'Cam Group': [{ sceneItemId: 11, sourceName: 'Ring Light Overlay', sceneItemEnabled: false, isGroup: false }],
    },
    filters: {
      'Webcam': [
        { filterName: 'Blur', filterKind: 'blur_filter', filterEnabled: false },
        { filterName: 'Color Grade', filterKind: 'color_filter_v2', filterEnabled: true },
      ],
      'Cam Group': [{ filterName: 'Group Vignette', filterKind: 'vignette_filter', filterEnabled: false }],
      'Mic/Aux': [{ filterName: 'Noise Gate', filterKind: 'noise_gate_filter', filterEnabled: true }],
    },
    mutes: { 'Webcam': false, 'Mic/Aux': false, 'Desktop Audio': true, 'Intro Video': false },
    volumes: { 'Webcam': 0, 'Mic/Aux': -6, 'Desktop Audio': -12, 'Intro Video': 0 },
    monitors: {
      'Webcam': 'OBS_MONITORING_TYPE_NONE',
      'Mic/Aux': 'OBS_MONITORING_TYPE_NONE',
      'Desktop Audio': 'OBS_MONITORING_TYPE_MONITOR_ONLY',
      'Intro Video': 'OBS_MONITORING_TYPE_NONE',
    },
    mediaStates: { 'Intro Video': 'OBS_MEDIA_STATE_STOPPED', 'Photo Slideshow': 'OBS_MEDIA_STATE_STOPPED' },
    videoSettings: {
      baseWidth: 1920,
      baseHeight: 1080,
      outputWidth: 1920,
      outputHeight: 1080,
      fpsNumerator: 60,
      fpsDenominator: 1,
    },
    stats: {
      cpuUsage: 14.2,
      memoryUsage: 512.4,
      activeFps: 60.0,
      averageFrameTime: 4.2,
      renderSkippedFrames: 3,
      outputSkippedFrames: 1,
    },
    hotkeys: ['OBSBasic.StartRecording', 'OBSBasic.StopRecording', 'OBSBasic.Screenshot'],
    triggeredHotkeys: [],
    triggeredKeySequences: [],
    chapters: [],
    itemTransforms: {},
    outputs: {
      stream: false,
      record: false,
      recordPaused: false,
      vcam: false,
      replay: false,
    },
    streamTimecode: null,
    streamDuration: null,
    streamStatus: null,
    recordTimecode: null,
    recordDuration: null,
    recordStatus: null,
    mediaDurations: {},
    mediaCursors: {},
    mediaStatus: {},
    profiles: ['Default', 'Streaming 1080p'],
    currentProfile: 'Default',
    collections: ['Main Show', 'Podcast'],
    currentCollection: 'Main Show',
    transitions: ['Fade', 'Cut', 'Slide'],
    currentTransition: 'Fade',
    transitionDuration: 300,
    savedScreenshots: [],
    lastSavedReplay: '',
    calls: [],
    reidentifies: [],
    connections: 0,
    sceneItemListDelayMs: 0,
    inFlightSceneItemRequests: 0,
    maxConcurrentSceneItemRequests: 0,
  };

  const wss = host ? new WebSocketServer({ host, port: 0 }) : new WebSocketServer({ port: 0 });
  const sockets = new Set();
  const broadcast = (eventType, eventData = {}) => {
    if (eventType === 'SceneNameChanged') {
      const { oldSceneName, sceneName } = eventData;
      if (oldSceneName && sceneName) {
        const idx = state.scenes.indexOf(oldSceneName);
        if (idx >= 0) state.scenes[idx] = sceneName;
        if (state.programScene === oldSceneName) state.programScene = sceneName;
        if (state.previewScene === oldSceneName) state.previewScene = sceneName;
        if (Object.prototype.hasOwnProperty.call(state.sceneItems, oldSceneName)) {
          state.sceneItems[sceneName] = state.sceneItems[oldSceneName];
          delete state.sceneItems[oldSceneName];
        }
        if (Object.prototype.hasOwnProperty.call(state.filters, oldSceneName)) {
          state.filters[sceneName] = state.filters[oldSceneName];
          delete state.filters[oldSceneName];
        }
        for (const k of Object.keys(state.itemTransforms)) {
          if (k.startsWith(`${oldSceneName}:`)) {
            state.itemTransforms[`${sceneName}:${k.slice(oldSceneName.length + 1)}`] = state.itemTransforms[k];
            delete state.itemTransforms[k];
          }
        }
      }
    } else if (eventType === 'InputNameChanged') {
      const { oldInputName, inputName } = eventData;
      if (oldInputName && inputName) {
        const idx = state.inputs.indexOf(oldInputName);
        if (idx >= 0) state.inputs[idx] = inputName;
        for (const map of [state.inputKinds, state.inputSettings, state.filters, state.mutes, state.volumes, state.monitors, state.mediaStates]) {
          if (Object.prototype.hasOwnProperty.call(map, oldInputName)) {
            map[inputName] = map[oldInputName];
            delete map[oldInputName];
          }
        }
        for (const list of [...Object.values(state.sceneItems), ...Object.values(state.groupItems)]) {
          for (const it of list) {
            if (it.sourceName === oldInputName) it.sourceName = inputName;
          }
        }
      }
    } else if (eventType === 'SceneRemoved') {
      const { sceneName } = eventData;
      if (sceneName) {
        state.scenes = state.scenes.filter((s) => s !== sceneName);
        delete state.sceneItems[sceneName];
        if (state.programScene === sceneName) state.programScene = state.scenes[0] || '';
        if (state.previewScene === sceneName) state.previewScene = state.scenes[0] || '';
      }
    } else if (eventType === 'MediaInputActionTriggered') {
      const { inputName, mediaAction } = eventData;
      if (inputName) {
        if (mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' || mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' || mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT' || mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS') {
          state.mediaStates[inputName] = 'OBS_MEDIA_STATE_PLAYING';
        } else if (mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE') {
          state.mediaStates[inputName] = 'OBS_MEDIA_STATE_PAUSED';
        } else if (mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP') {
          state.mediaStates[inputName] = 'OBS_MEDIA_STATE_STOPPED';
        }
      }
    } else if (eventType === 'InputVolumeChanged') {
      const { inputName, inputVolumeDb } = eventData;
      if (inputName && typeof inputVolumeDb === 'number') state.volumes[inputName] = inputVolumeDb;
    } else if (eventType === 'StreamStateChanged') {
      if (typeof eventData.outputActive === 'boolean') state.outputs.stream = eventData.outputActive;
    } else if (eventType === 'RecordStateChanged') {
      if (typeof eventData.outputActive === 'boolean') state.outputs.record = eventData.outputActive;
      if (eventData.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED') state.outputs.recordPaused = true;
      else if (eventData.outputState === 'OBS_WEBSOCKET_OUTPUT_RESUMED' || eventData.outputActive === false) state.outputs.recordPaused = false;
    } else if (eventType === 'VirtualcamStateChanged') {
      if (typeof eventData.outputActive === 'boolean') state.outputs.vcam = eventData.outputActive;
    } else if (eventType === 'ReplayBufferStateChanged') {
      if (typeof eventData.outputActive === 'boolean') state.outputs.replay = eventData.outputActive;
    } else if (eventType === 'MediaInputPlaybackStarted') {
      if (eventData.inputName) state.mediaStates[eventData.inputName] = 'OBS_MEDIA_STATE_PLAYING';
    } else if (eventType === 'MediaInputPlaybackEnded') {
      if (eventData.inputName) state.mediaStates[eventData.inputName] = 'OBS_MEDIA_STATE_ENDED';
    } else if (eventType === 'SourceFilterNameChanged') {
      const { sourceName, oldFilterName, filterName } = eventData;
      if (sourceName && oldFilterName && filterName) {
        const flt = (state.filters[sourceName] || []).find((f) => f.filterName === oldFilterName);
        if (flt) flt.filterName = filterName;
      }
    }
    const payload = JSON.stringify({ op: 5, d: { eventType, eventIntent: 2047, eventData } });
    for (const s of sockets) {
      if (s.readyState !== 1 || !s._authed) continue;
      if (eventType === 'InputVolumeMeters' && ((Number(s._eventSubscriptions) || 0) & 65536) === 0) continue;
      s.send(payload);
    }
  };

  const closeAll = (code = 1000, reason = '') => {
    for (const s of [...sockets]) {
      try { s.close(code, reason); } catch {}
    }
  };

  wss.on('connection', (ws) => {
    state.connections++;
    sockets.add(ws);
    ws._authed = false;
    ws.on('close', () => sockets.delete(ws));
    const hello = { obsWebSocketVersion: '5.5.2', rpcVersion: 1 };
    if (requireAuth) hello.authentication = { challenge: CHALLENGE, salt: SALT };
    ws.send(JSON.stringify({ op: 0, d: hello }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.op === 1) {
        if (requireAuth && msg.d?.authentication !== EXPECTED_AUTH) { ws.close(4009, 'Authentication failed.'); return; }
        ws._authed = true;
        ws._eventSubscriptions = msg.d?.eventSubscriptions ?? 2047;
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (msg.op === 3) {
        if (ws._authed) {
          ws._eventSubscriptions = Number(msg.d?.eventSubscriptions ?? 2047);
          state.reidentifies.push(ws._eventSubscriptions);
        }
        return;
      }
      if (msg.op !== 6) return;
      const { requestType, requestId, requestData = {} } = msg.d;
      state.calls.push({ requestType, requestData });
      let responseData = {};
      let ok = true;
      let comment = '';

      if (requestType === 'GetSceneList') {
        responseData = {
          currentProgramSceneName: state.programScene,
          currentPreviewSceneName: state.previewScene,
          scenes: state.scenes.map((sceneName, sceneIndex) => ({ sceneName, sceneIndex })),
        };
      } else if (requestType === 'GetInputList') {
        responseData = {
          inputs: state.inputs.map((inputName) => ({
            inputName,
            inputKind: state.inputKinds[inputName] || 'unknown_input',
          })),
        };
      } else if (requestType === 'GetSceneItemList') {
        responseData = { sceneItems: state.sceneItems[requestData.sceneName] || [] };
        if (state.sceneItemListDelayMs > 0) {
          state.inFlightSceneItemRequests = (state.inFlightSceneItemRequests || 0) + 1;
          state.maxConcurrentSceneItemRequests = Math.max(
            state.maxConcurrentSceneItemRequests || 0,
            state.inFlightSceneItemRequests
          );
          setTimeout(() => {
            state.inFlightSceneItemRequests--;
            if (ws.readyState === 1) {
              try {
                ws.send(JSON.stringify({
                  op: 7,
                  d: { requestType, requestId, requestStatus: { result: ok, code: ok ? 100 : 600, comment }, responseData },
                }));
              } catch {}
            }
          }, state.sceneItemListDelayMs);
          return;
        }
      } else if (requestType === 'GetGroupSceneItemList') {
        responseData = { sceneItems: state.groupItems[requestData.sceneName] || [] };
      } else if (requestType === 'GetSourceFilterList') {
        responseData = { filters: state.filters[requestData.sourceName] || [] };
      } else if (requestType === 'GetInputMute') {
        responseData = { inputMuted: !!state.mutes[requestData.inputName] };
      } else if (requestType === 'SetCurrentProgramScene') {
        state.programScene = requestData.sceneName;
        broadcast('CurrentProgramSceneChanged', { sceneName: state.programScene });
      } else if (requestType === 'SetSceneItemEnabled') {
        const list = state.sceneItems[requestData.sceneName] || state.groupItems[requestData.sceneName] || [];
        const it = list.find((x) => x.sceneItemId === requestData.sceneItemId);
        if (!it) { ok = false; comment = 'Item not found'; }
        else {
          it.sceneItemEnabled = !!requestData.sceneItemEnabled;
          broadcast('SceneItemEnableStateChanged', {
            sceneName: requestData.sceneName,
            sceneItemId: it.sceneItemId,
            sceneItemEnabled: it.sceneItemEnabled,
          });
        }
      } else if (requestType === 'SetSourceFilterEnabled') {
        const f = (state.filters[requestData.sourceName] || []).find((x) => x.filterName === requestData.filterName);
        if (!f) { ok = false; comment = 'Filter not found'; }
        else {
          f.filterEnabled = !!requestData.filterEnabled;
          broadcast('SourceFilterEnableStateChanged', {
            sourceName: requestData.sourceName,
            filterName: f.filterName,
            filterEnabled: f.filterEnabled,
          });
        }
      } else if (requestType === 'ToggleInputMute') {
        state.mutes[requestData.inputName] = !state.mutes[requestData.inputName];
        responseData = { inputMuted: state.mutes[requestData.inputName] };
        broadcast('InputMuteStateChanged', { inputName: requestData.inputName, inputMuted: responseData.inputMuted });
      } else if (requestType === 'SetInputMute') {
        state.mutes[requestData.inputName] = !!requestData.inputMuted;
        broadcast('InputMuteStateChanged', { inputName: requestData.inputName, inputMuted: state.mutes[requestData.inputName] });
      } else if (requestType === 'GetStudioModeEnabled') {
        responseData = { studioModeEnabled: !!state.studioModeEnabled };
      } else if (requestType === 'SetStudioModeEnabled') {
        state.studioModeEnabled = !!requestData.studioModeEnabled;
        broadcast('StudioModeStateChanged', { studioModeEnabled: state.studioModeEnabled });
      } else if (requestType === 'SetCurrentPreviewScene') {
        state.previewScene = requestData.sceneName;
        broadcast('CurrentPreviewSceneChanged', { sceneName: state.previewScene });
      } else if (requestType === 'TriggerStudioModeTransition') {
        if (!state.studioModeEnabled) { ok = false; comment = 'Studio mode not enabled'; }
        else {
          state.programScene = state.previewScene;
          broadcast('CurrentProgramSceneChanged', { sceneName: state.programScene });
        }
      } else if (requestType === 'GetStreamStatus') {
        responseData = {
          outputActive: !!state.outputs.stream,
          outputDuration: state.streamDuration ?? (state.outputs.stream ? 65000 : 0),
          outputTimecode: state.streamTimecode ?? (state.outputs.stream ? '00:01:05' : '00:00:00'),
          outputCongestion: 0,
          outputBytes: 0,
          outputSkippedFrames: 0,
          outputTotalFrames: 0,
          ...(state.streamStatus || {}),
        };
      } else if (requestType === 'StartStream') {
        state.outputs.stream = true;
        broadcast('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
      } else if (requestType === 'StopStream') {
        state.outputs.stream = false;
        broadcast('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
      } else if (requestType === 'ToggleStream') {
        state.outputs.stream = !state.outputs.stream;
        responseData = { outputActive: state.outputs.stream };
        broadcast('StreamStateChanged', {
          outputActive: state.outputs.stream,
          outputState: state.outputs.stream ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED',
        });
      } else if (requestType === 'GetRecordStatus') {
        responseData = {
          outputActive: !!state.outputs.record,
          outputPaused: !!state.outputs.recordPaused,
          outputDuration: state.recordDuration ?? (state.outputs.record ? 83000 : 0),
          outputTimecode: state.recordTimecode ?? (state.outputs.record ? '00:01:23' : '00:00:00'),
          ...(state.recordStatus || {}),
        };
      } else if (requestType === 'StartRecord') {
        state.outputs.record = true;
        state.outputs.recordPaused = false;
        broadcast('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
      } else if (requestType === 'StopRecord') {
        state.outputs.record = false;
        state.outputs.recordPaused = false;
        broadcast('RecordStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
      } else if (requestType === 'ToggleRecord') {
        state.outputs.record = !state.outputs.record;
        if (!state.outputs.record) state.outputs.recordPaused = false;
        responseData = { outputActive: state.outputs.record };
        broadcast('RecordStateChanged', {
          outputActive: state.outputs.record,
          outputState: state.outputs.record ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED',
        });
      } else if (requestType === 'PauseRecord') {
        state.outputs.recordPaused = true;
        broadcast('RecordStateChanged', { outputActive: state.outputs.record, outputState: 'OBS_WEBSOCKET_OUTPUT_PAUSED' });
      } else if (requestType === 'ResumeRecord') {
        state.outputs.recordPaused = false;
        broadcast('RecordStateChanged', { outputActive: state.outputs.record, outputState: 'OBS_WEBSOCKET_OUTPUT_RESUMED' });
      } else if (requestType === 'ToggleRecordPause') {
        state.outputs.recordPaused = !state.outputs.recordPaused;
        responseData = { outputPaused: state.outputs.recordPaused };
        broadcast('RecordStateChanged', {
          outputActive: state.outputs.record,
          outputState: state.outputs.recordPaused ? 'OBS_WEBSOCKET_OUTPUT_PAUSED' : 'OBS_WEBSOCKET_OUTPUT_RESUMED',
        });
      } else if (requestType === 'GetVirtualCamStatus') {
        responseData = { outputActive: !!state.outputs.vcam };
      } else if (requestType === 'StartVirtualCam') {
        state.outputs.vcam = true;
        broadcast('VirtualcamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
      } else if (requestType === 'StopVirtualCam') {
        state.outputs.vcam = false;
        broadcast('VirtualcamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
      } else if (requestType === 'ToggleVirtualCam') {
        state.outputs.vcam = !state.outputs.vcam;
        responseData = { outputActive: state.outputs.vcam };
        broadcast('VirtualcamStateChanged', {
          outputActive: state.outputs.vcam,
          outputState: state.outputs.vcam ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED',
        });
      } else if (requestType === 'GetReplayBufferStatus') {
        responseData = { outputActive: !!state.outputs.replay };
      } else if (requestType === 'StartReplayBuffer') {
        state.outputs.replay = true;
        broadcast('ReplayBufferStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
      } else if (requestType === 'StopReplayBuffer') {
        state.outputs.replay = false;
        broadcast('ReplayBufferStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
      } else if (requestType === 'ToggleReplayBuffer') {
        state.outputs.replay = !state.outputs.replay;
        responseData = { outputActive: state.outputs.replay };
        broadcast('ReplayBufferStateChanged', {
          outputActive: state.outputs.replay,
          outputState: state.outputs.replay ? 'OBS_WEBSOCKET_OUTPUT_STARTED' : 'OBS_WEBSOCKET_OUTPUT_STOPPED',
        });
      } else if (requestType === 'SaveReplayBuffer') {
        state.lastSavedReplay = '/tmp/Replay-2026.mkv';
        broadcast('ReplayBufferSaved', { savedReplayPath: state.lastSavedReplay });
      } else if (requestType === 'GetMediaInputStatus') {
        const inputName = requestData?.inputName;
        const custom = state.mediaStatus?.[inputName] || {};
        responseData = {
          mediaState: state.mediaStates[inputName] || 'OBS_MEDIA_STATE_STOPPED',
          mediaDuration: state.mediaDurations?.[inputName] ?? 120000,
          mediaCursor: state.mediaCursors?.[inputName] ?? 45000,
          ...custom,
        };
      } else if (requestType === 'TriggerMediaInputAction') {
        const name = requestData.inputName;
        const ma = requestData.mediaAction;
        if (!state.inputs.includes(name)) { ok = false; comment = 'Input not found'; }
        else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' || ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_PLAYING';
          broadcast('MediaInputActionTriggered', { inputName: name, mediaAction: ma });
          broadcast('MediaInputPlaybackStarted', { inputName: name });
        } else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_PAUSED';
          broadcast('MediaInputActionTriggered', { inputName: name, mediaAction: ma });
        } else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_STOPPED';
          broadcast('MediaInputActionTriggered', { inputName: name, mediaAction: ma });
          broadcast('MediaInputPlaybackEnded', { inputName: name });
        } else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT' || ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_PLAYING';
          broadcast('MediaInputActionTriggered', { inputName: name, mediaAction: ma });
        }
      } else if (requestType === 'PressInputPropertiesButton') {
        if (!state.inputs.includes(requestData.inputName)) { ok = false; comment = 'Input not found'; }
      } else if (requestType === 'SetInputSettings') {
        if (!state.inputs.includes(requestData.inputName)) { ok = false; comment = 'Input not found'; }
        else {
          const prev = state.inputSettings[requestData.inputName] || {};
          state.inputSettings[requestData.inputName] = requestData.overlay
            ? { ...prev, ...(requestData.inputSettings || {}) }
            : { ...(requestData.inputSettings || {}) };
          broadcast('InputSettingsChanged', {
            inputName: requestData.inputName,
            inputSettings: state.inputSettings[requestData.inputName],
          });
        }
      } else if (requestType === 'GetInputSettings') {
        responseData = {
          inputSettings: state.inputSettings[requestData.inputName] || {},
          inputKind: state.inputKinds[requestData.inputName] || '',
        };
      } else if (requestType === 'GetInputVolume') {
        responseData = { inputVolumeDb: state.volumes[requestData.inputName] ?? 0, inputVolumeMul: 1 };
      } else if (requestType === 'SetInputVolume') {
        state.volumes[requestData.inputName] = Number(requestData.inputVolumeDb);
        broadcast('InputVolumeChanged', {
          inputName: requestData.inputName,
          inputVolumeDb: state.volumes[requestData.inputName],
          inputVolumeMul: 1,
        });
      } else if (requestType === 'GetProfileList') {
        responseData = { currentProfileName: state.currentProfile, profiles: state.profiles };
      } else if (requestType === 'SetCurrentProfile') {
        if (!state.profiles.includes(requestData.profileName)) { ok = false; comment = 'Profile not found'; }
        else {
          state.currentProfile = requestData.profileName;
          broadcast('CurrentProfileChanged', { profileName: state.currentProfile });
        }
      } else if (requestType === 'GetSceneCollectionList') {
        responseData = { currentSceneCollectionName: state.currentCollection, sceneCollections: state.collections };
      } else if (requestType === 'SetCurrentSceneCollection') {
        if (!state.collections.includes(requestData.sceneCollectionName)) { ok = false; comment = 'Collection not found'; }
        else {
          state.currentCollection = requestData.sceneCollectionName;
          broadcast('CurrentSceneCollectionChanged', { sceneCollectionName: state.currentCollection });
        }
      } else if (requestType === 'GetSceneTransitionList') {
        responseData = {
          currentSceneTransitionName: state.currentTransition,
          transitions: state.transitions.map((transitionName) => ({ transitionName })),
        };
      } else if (requestType === 'GetCurrentSceneTransition') {
        responseData = {
          transitionName: state.currentTransition,
          transitionDuration: state.transitionDuration,
        };
      } else if (requestType === 'SetCurrentSceneTransition') {
        if (!state.transitions.includes(requestData.transitionName)) { ok = false; comment = 'Transition not found'; }
        else {
          state.currentTransition = requestData.transitionName;
          broadcast('CurrentSceneTransitionChanged', { transitionName: state.currentTransition });
        }
      } else if (requestType === 'SetCurrentSceneTransitionDuration') {
        state.transitionDuration = Number(requestData.transitionDuration);
        broadcast('CurrentSceneTransitionDurationChanged', { transitionDuration: state.transitionDuration });
      } else if (requestType === 'GetSourceScreenshot') {
        responseData = { imageData: TINY_PNG_DATA_URL };
      } else if (requestType === 'SaveSourceScreenshot') {
        state.savedScreenshots.push({
          sourceName: requestData.sourceName,
          imageFormat: requestData.imageFormat,
          imageFilePath: requestData.imageFilePath,
        });
      } else if (requestType === 'GetStats') {
        responseData = { ...state.stats };
      } else if (requestType === 'GetVideoSettings') {
        responseData = { ...state.videoSettings };
      } else if (requestType === 'GetHotkeyList') {
        responseData = { hotkeys: state.hotkeys };
      } else if (requestType === 'TriggerHotkeyByName') {
        if (!requestData.hotkeyName) { ok = false; comment = 'Missing hotkeyName'; }
        else state.triggeredHotkeys.push(requestData.hotkeyName);
      } else if (requestType === 'TriggerHotkeyByKeySequence') {
        if (!requestData.keyId) { ok = false; comment = 'Missing keyId'; }
        else state.triggeredKeySequences.push({
          keyId: requestData.keyId,
          keyModifiers: requestData.keyModifiers || {},
        });
      } else if (requestType === 'CreateRecordChapter') {
        state.chapters.push({ chapterName: requestData.chapterName || '' });
      } else if (requestType === 'GetInputAudioMonitorType') {
        responseData = { monitorType: state.monitors[requestData.inputName] || 'OBS_MONITORING_TYPE_NONE' };
      } else if (requestType === 'SetInputAudioMonitorType') {
        if (!state.inputs.includes(requestData.inputName)) { ok = false; comment = 'Input not found'; }
        else {
          state.monitors[requestData.inputName] = requestData.monitorType;
          broadcast('InputAudioMonitorTypeChanged', {
            inputName: requestData.inputName,
            monitorType: requestData.monitorType,
          });
        }
      } else if (requestType === 'GetSceneItemTransform') {
        const list = state.sceneItems[requestData.sceneName] || state.groupItems[requestData.sceneName] || [];
        const it = list.find((x) => x.sceneItemId === requestData.sceneItemId);
        if (!it) { ok = false; comment = 'Item not found'; }
        else {
          const key = `${requestData.sceneName}:${requestData.sceneItemId}`;
          const base = {
            positionX: 0,
            positionY: 0,
            scaleX: 1,
            scaleY: 1,
            sourceWidth: state.videoSettings.baseWidth,
            sourceHeight: state.videoSettings.baseHeight,
            cropLeft: 0,
            cropRight: 0,
            cropTop: 0,
            cropBottom: 0,
            alignment: 5,
            rotation: 0,
          };
          responseData = { sceneItemTransform: { ...base, ...(state.itemTransforms[key] || {}) } };
        }
      } else if (requestType === 'SetSceneItemTransform') {
        const list = state.sceneItems[requestData.sceneName] || state.groupItems[requestData.sceneName] || [];
        const it = list.find((x) => x.sceneItemId === requestData.sceneItemId);
        if (!it) { ok = false; comment = 'Item not found'; }
        else {
          const key = `${requestData.sceneName}:${requestData.sceneItemId}`;
          const prev = state.itemTransforms[key] || {
            positionX: 0,
            positionY: 0,
            scaleX: 1,
            scaleY: 1,
            sourceWidth: state.videoSettings.baseWidth,
            sourceHeight: state.videoSettings.baseHeight,
            cropLeft: 0,
            cropRight: 0,
            cropTop: 0,
            cropBottom: 0,
            alignment: 5,
            rotation: 0,
          };
          state.itemTransforms[key] = { ...prev, ...(requestData.sceneItemTransform || {}) };
        }
      }

      ws.send(JSON.stringify({
        op: 7,
        d: { requestType, requestId, requestStatus: { result: ok, code: ok ? 100 : 600, comment }, responseData },
      }));
    });
  });

  return { wss, state, broadcast, closeAll };
}

function blockLiveObsInInitScript() {
  const OrigWS = window.WebSocket;
  const blocked = new Set(['4455', '4456', '4457', '4458', '4444']);
  window.WebSocket = function (url, protocols) {
    try {
      const u = new URL(url);
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && blocked.has(u.port || '80')) {
        const fake = {
          readyState: 3,
          close() {},
          send() {},
          addEventListener() {},
          removeEventListener() {},
        };
        setTimeout(() => {
          if (typeof fake.onerror === 'function') fake.onerror(new Event('error'));
          if (typeof fake.onclose === 'function') fake.onclose({ code: 1006, reason: 'Blocked live OBS port in hermetic test' });
        }, 5);
        return fake;
      }
    } catch {}
    return protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
  };
  window.WebSocket.prototype = OrigWS.prototype;
  window.WebSocket.CONNECTING = OrigWS.CONNECTING;
  window.WebSocket.OPEN = OrigWS.OPEN;
  window.WebSocket.CLOSING = OrigWS.CLOSING;
  window.WebSocket.CLOSED = OrigWS.CLOSED;
}

export function isolateBrowserFromLiveObs(browser) {
  const patchCtx = async (ctx) => {
    await ctx.addInitScript(blockLiveObsInInitScript);
    return ctx;
  };
  const origNewContext = browser.newContext.bind(browser);
  const origNewPage = browser.newPage.bind(browser);
  browser.newContext = async (...args) => patchCtx(await origNewContext(...args));
  browser.newPage = async (...args) => {
    const page = await origNewPage(...args);
    await page.addInitScript(blockLiveObsInInitScript);
    return page;
  };
  return browser;
}

// v2 header: secondary actions sit behind the ⋯ menu (#btn-more). Open it when the target is not on screen, then click.
export async function clickMenuItem(page, selector) {
  if (!(await page.isVisible(selector))) await page.click('#btn-more');
  await page.click(selector);
  // Text size and theme keep the menu open for repeat taps; close it so it never covers later clicks.
  if (await page.isVisible('#more-menu')) await page.keyboard.press('Escape');
}

export async function closeMoreMenu(page) {
  if (await page.isVisible('#more-menu')) await page.keyboard.press('Escape');
}

export async function openMoreMenu(page) {
  if (await page.isHidden('#more-menu')) await page.click('#btn-more');
}

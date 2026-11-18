import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

export const PASSWORD = 's3cr3t-vệt';
export const SALT = 'NaCl-muối';
export const CHALLENGE = 'Ch4ll3ng3';
const b64sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
const EXPECTED_AUTH = b64sha(b64sha(PASSWORD + SALT) + CHALLENGE);

const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export function createFakeObs(requireAuth = true) {
  const state = {
    programScene: 'Main Cam',
    previewScene: 'Slides',
    studioModeEnabled: false,
    scenes: ['BRB', 'Slides', 'Main Cam', '<img src=x onerror="window.__xss=1"> #cam'],
    inputs: ['Webcam', 'Mic/Aux', 'Desktop Audio', 'Intro Video', 'Alert Overlay', 'Slide Image', 'Photo Slideshow'],
    inputKinds: {
      'Webcam': 'dshow_input',
      'Mic/Aux': 'wasapi_input_capture',
      'Desktop Audio': 'wasapi_output_capture',
      'Intro Video': 'ffmpeg_source',
      'Alert Overlay': 'browser_source',
      'Slide Image': 'image_source',
      'Photo Slideshow': 'slideshow',
    },
    inputSettings: {
      'Alert Overlay': { url: 'https://example.com/alerts' },
      'Slide Image': { file: '/img/slide1.png' },
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
      renderSkippedFrames: 3,
      outputSkippedFrames: 1,
    },
    hotkeys: ['OBSBasic.StartRecording', 'OBSBasic.StopRecording', 'OBSBasic.Screenshot'],
    triggeredHotkeys: [],
    chapters: [],
    itemTransforms: {},
    outputs: {
      stream: false,
      record: false,
      recordPaused: false,
      vcam: false,
      replay: false,
    },
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
    connections: 0,
  };

  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const sockets = new Set();
  const broadcast = (eventType, eventData) => {
    const payload = JSON.stringify({ op: 5, d: { eventType, eventIntent: 2047, eventData } });
    for (const s of sockets) if (s.readyState === 1 && s._authed) s.send(payload);
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
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
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
        responseData = { outputActive: !!state.outputs.stream };
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
        responseData = { outputActive: !!state.outputs.record, outputPaused: !!state.outputs.recordPaused };
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
        responseData = { mediaState: state.mediaStates[requestData.inputName] || 'OBS_MEDIA_STATE_STOPPED' };
      } else if (requestType === 'TriggerMediaInputAction') {
        const name = requestData.inputName;
        const ma = requestData.mediaAction;
        if (!state.inputs.includes(name)) { ok = false; comment = 'Input not found'; }
        else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' || ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_PLAYING';
          broadcast('MediaInputPlaybackStarted', { inputName: name });
        } else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_PAUSED';
        } else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_STOPPED';
          broadcast('MediaInputPlaybackEnded', { inputName: name });
        } else if (ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT' || ma === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS') {
          state.mediaStates[name] = 'OBS_MEDIA_STATE_PLAYING';
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

  return { wss, state, broadcast };
}

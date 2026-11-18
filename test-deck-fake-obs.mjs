import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

export const PASSWORD = 's3cr3t-vệt';
export const SALT = 'NaCl-muối';
export const CHALLENGE = 'Ch4ll3ng3';
const b64sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
const EXPECTED_AUTH = b64sha(b64sha(PASSWORD + SALT) + CHALLENGE);

export function createFakeObs(requireAuth = true) {
  const state = {
    programScene: 'Main Cam',
    scenes: ['BRB', 'Slides', 'Main Cam', '<img src=x onerror="window.__xss=1"> #cam'],
    inputs: ['Webcam', 'Mic/Aux', 'Desktop Audio'],
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
    mutes: { 'Webcam': false, 'Mic/Aux': false, 'Desktop Audio': true },
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
          currentPreviewSceneName: 'Slides',
          scenes: state.scenes.map((sceneName, sceneIndex) => ({ sceneName, sceneIndex })),
        };
      } else if (requestType === 'GetInputList') {
        responseData = { inputs: state.inputs.map((inputName) => ({ inputName })) };
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
      }

      ws.send(JSON.stringify({
        op: 7,
        d: { requestType, requestId, requestStatus: { result: ok, code: ok ? 100 : 600, comment }, responseData },
      }));
    });
  });

  return { wss, state, broadcast };
}

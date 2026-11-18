(() => {
  'use strict';

  const STORAGE_KEY = 'obs_virtual_deck_v1';
  const PAD_COUNT = 64;
  const COLORS = ['#222733', '#1e3a8a', '#115e59', '#166534', '#854d0e', '#991b1b', '#581c87', '#831843'];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Pure-JS UTF-8 SHA-256 -> Base64 (works on file:// and non-HTTPS LAN URLs)
  function sha256Base64(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const bitLen = bytes.length * 8;
    const padLen = ((bytes.length + 8) >> 6) + 1;
    const buf = new Uint8Array(padLen * 64);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(buf.length - 8, Math.floor(bitLen / 0x100000000), false);
    dv.setUint32(buf.length - 4, bitLen >>> 0, false);
    const w = new Int32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < buf.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(o + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ ((~e) & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setInt32(i * 4, v, false));
    let bin = '';
    for (const b of out) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function normalizePad(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { type: 'none', label: '', icon: '', color: COLORS[0] };
    }
    const type = ['none', 'scene', 'source', 'filter', 'mute', 'macro', 'panic'].includes(raw.type) ? raw.type : 'none';
    const out = {
      type,
      label: typeof raw.label === 'string' ? raw.label : '',
      icon: typeof raw.icon === 'string' ? raw.icon : '',
      color: typeof raw.color === 'string' && raw.color ? raw.color : COLORS[0],
    };
    if (type === 'scene' && raw.sceneName) out.sceneName = String(raw.sceneName);
    else if (type === 'source') {
      if (raw.sceneName) out.sceneName = String(raw.sceneName);
      if (raw.sourceName) out.sourceName = String(raw.sourceName);
      if (raw.mode) out.mode = String(raw.mode);
    } else if (type === 'filter') {
      if (raw.sourceName) out.sourceName = String(raw.sourceName);
      if (raw.filterName) out.filterName = String(raw.filterName);
      if (raw.mode) out.mode = String(raw.mode);
    } else if (type === 'mute') {
      if (raw.inputName) out.inputName = String(raw.inputName);
      if (raw.mode) out.mode = String(raw.mode);
    } else if (type === 'macro') {
      out.steps = Array.isArray(raw.steps) ? raw.steps.filter((s) => s && typeof s === 'object') : [];
    }
    return out;
  }

  function defaultPads() {
    const pads = Array.from({ length: PAD_COUNT }, () => ({ type: 'none', label: '', icon: '', color: COLORS[0] }));
    pads[63] = { type: 'panic', label: 'PANIC', icon: '🚨', color: '#991b1b' };
    return pads;
  }

  function loadState() {
    const base = { ws: { host: '127.0.0.1', port: 4455, password: '' }, pads: defaultPads(), panicSteps: [] };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const d = JSON.parse(raw);
      if (d.ws) {
        const port = Number(d.ws.port);
        Object.assign(base.ws, {
          host: String(d.ws.host || '127.0.0.1'),
          port: port >= 1 && port <= 65535 ? port : 4455,
          password: String(d.ws.password || ''),
        });
      }
      if (Array.isArray(d.pads)) {
        for (let i = 0; i < PAD_COUNT; i++) if (d.pads[i]) base.pads[i] = normalizePad(d.pads[i]);
      }
      if (Array.isArray(d.panicSteps)) base.panicSteps = d.panicSteps.filter((s) => s && typeof s === 'object');
    } catch {}
    return base;
  }

  const Deck = {
    PAD_COUNT,
    COLORS,
    $,
    esc,
    normalizePad,
    defaultPads,
    cfg: loadState(),
    editMode: false,
    activeMacros: new Map(),
    obs: {
      ws: null,
      status: 'bad',
      reqId: 0,
      pending: new Map(),
      reconnectTimer: null,
      manualClose: false,
      scenes: [],
      groups: new Set(),
      inputs: [],
      programScene: '',
      previewScene: '',
      itemsByScene: {},
      filtersBySource: {},
      mutes: {},
    },
    renderGrid: () => {},
    updateMacroTicks: () => {},
  };

  Deck.saveCfg = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Deck.cfg)); } catch {}
  };
  Deck.setMsg = (txt) => { $('msg-info').textContent = txt; };
  Deck.updateSceneHeader = () => { $('scene-info').textContent = `Program: ${Deck.obs.programScene || '—'}`; };
  Deck.setConn = (cls, txt) => {
    Deck.obs.status = cls;
    $('conn-pill').className = `pill ${cls}`;
    $('conn-text').textContent = txt;
  };

  Deck.obsCall = (requestType, requestData) => {
    const { obs } = Deck;
    if (!obs.ws || obs.ws.readyState !== 1) return Promise.reject(new Error('Not connected to OBS'));
    const requestId = String(++obs.reqId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        obs.pending.delete(requestId);
        reject(new Error(`Timeout: ${requestType}`));
      }, 5000);
      obs.pending.set(requestId, { resolve, reject, timer, requestType });
      obs.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  };

  Deck.refreshFilters = async (sourceName) => {
    if (!sourceName) return [];
    try {
      const r = await Deck.obsCall('GetSourceFilterList', { sourceName });
      Deck.obs.filtersBySource[sourceName] = r.filters || [];
    } catch {
      Deck.obs.filtersBySource[sourceName] = Deck.obs.filtersBySource[sourceName] || [];
    }
    return Deck.obs.filtersBySource[sourceName];
  };

  Deck.fetchMute = async (inputName) => {
    if (!inputName) return false;
    try {
      const r = await Deck.obsCall('GetInputMute', { inputName });
      Deck.obs.mutes[inputName] = !!r.inputMuted;
    } catch {}
    return !!Deck.obs.mutes[inputName];
  };

  async function refreshSceneOrGroupItems(name) {
    const { obs } = Deck;
    const req = obs.groups.has(name) ? 'GetGroupSceneItemList' : 'GetSceneItemList';
    const r = await Deck.obsCall(req, { sceneName: name });
    const items = r.sceneItems || [];
    obs.itemsByScene[name] = items;
    for (const it of items) {
      if (it.isGroup) {
        obs.groups.add(it.sourceName);
        try {
          const gr = await Deck.obsCall('GetGroupSceneItemList', { sceneName: it.sourceName });
          obs.itemsByScene[it.sourceName] = gr.sceneItems || [];
        } catch {}
      }
    }
  }

  Deck.syncObsState = async () => {
    const { obs, cfg } = Deck;
    try {
      const [sl, il] = await Promise.all([Deck.obsCall('GetSceneList'), Deck.obsCall('GetInputList')]);
      obs.scenes = (sl.scenes || []).map((s) => s.sceneName).reverse();
      obs.programScene = sl.currentProgramSceneName || '';
      obs.previewScene = sl.currentPreviewSceneName || '';
      obs.inputs = (il.inputs || []).map((i) => i.inputName);
      obs.groups = new Set();
      obs.itemsByScene = {};
      for (const s of obs.scenes) {
        try { await refreshSceneOrGroupItems(s); } catch {}
      }
      const filterSources = new Set();
      const muteInputs = new Set();
      const collectStep = (st) => {
        if (st.type === 'filter' && st.sourceName) filterSources.add(st.sourceName);
        if (st.type === 'mute' && st.inputName) muteInputs.add(st.inputName);
      };
      cfg.pads.forEach((p) => { collectStep(p); (p.steps || []).forEach(collectStep); });
      cfg.panicSteps.forEach(collectStep);
      await Promise.all([...filterSources].map(Deck.refreshFilters));
      await Promise.all([...muteInputs].map(Deck.fetchMute));
      Deck.updateSceneHeader();
      Deck.renderGrid();
    } catch (e) {
      Deck.setMsg(`Sync error: ${e.message}`);
    }
  };

  async function handleObsEvent(type, d) {
    const { obs } = Deck;
    if (type === 'CurrentProgramSceneChanged') {
      obs.programScene = d.sceneName || '';
      Deck.updateSceneHeader();
      Deck.renderGrid();
    } else if (type === 'CurrentPreviewSceneChanged') {
      obs.previewScene = d.sceneName || '';
    } else if (type === 'SceneListChanged' || type === 'SceneNameChanged' || type === 'InputNameChanged') {
      await Deck.syncObsState();
    } else if (type === 'InputCreated' || type === 'InputRemoved') {
      try {
        const il = await Deck.obsCall('GetInputList');
        obs.inputs = (il.inputs || []).map((i) => i.inputName);
      } catch {}
    } else if (type === 'SceneItemEnableStateChanged') {
      const arr = obs.itemsByScene[d.sceneName];
      if (arr) {
        const it = arr.find((x) => x.sceneItemId === d.sceneItemId);
        if (it) it.sceneItemEnabled = !!d.sceneItemEnabled;
      }
      Deck.renderGrid();
    } else if (type === 'SceneItemCreated' || type === 'SceneItemRemoved') {
      try { await refreshSceneOrGroupItems(d.sceneName); } catch {}
      Deck.renderGrid();
    } else if (type === 'SourceFilterEnableStateChanged') {
      const arr = obs.filtersBySource[d.sourceName];
      if (arr) {
        const f = arr.find((x) => x.filterName === d.filterName);
        if (f) f.filterEnabled = !!d.filterEnabled;
      }
      Deck.renderGrid();
    } else if (type === 'SourceFilterCreated' || type === 'SourceFilterRemoved' || type === 'SourceFilterListReindexed' || type === 'SourceFilterNameChanged') {
      await Deck.refreshFilters(d.sourceName);
      Deck.renderGrid();
    } else if (type === 'InputMuteStateChanged') {
      obs.mutes[d.inputName] = !!d.inputMuted;
      Deck.renderGrid();
    }
  }

  Deck.disconnectObs = (manual = true) => {
    const { obs } = Deck;
    obs.manualClose = manual;
    clearTimeout(obs.reconnectTimer);
    for (const p of obs.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Disconnected')); }
    obs.pending.clear();
    if (obs.ws) { const w = obs.ws; obs.ws = null; try { w.close(); } catch {} }
    if (manual) Deck.setConn('bad', 'Disconnected');
  };

  function buildWsTarget(rawHostInput, rawPortInput) {
    let raw = (rawHostInput || '127.0.0.1').trim();
    let proto = 'ws';
    const mProto = raw.match(/^(wss?):\/\//i);
    if (mProto) {
      proto = mProto[1].toLowerCase();
      raw = raw.slice(mProto[0].length);
    }
    raw = raw.replace(/\/.*$/, '');
    let port = Number(rawPortInput);
    if (!(port >= 1 && port <= 65535)) port = 4455;
    let host = raw || '127.0.0.1';
    const bracketPort = host.match(/^(\[[^\]]+\]):(\d+)$/);
    const hostPort = host.match(/^([^:]+):(\d+)$/);
    if (bracketPort) {
      host = bracketPort[1];
      port = Number(bracketPort[2]) || port;
    } else if (hostPort) {
      host = hostPort[1];
      port = Number(hostPort[2]) || port;
    } else if (host.includes(':') && !host.startsWith('[')) {
      host = `[${host}]`;
    }
    return { proto, host, port, url: `${proto}://${host}:${port}` };
  }

  Deck.connectObs = () => {
    const { obs, cfg } = Deck;
    Deck.disconnectObs(false);
    obs.manualClose = false;
    const { host, port, url } = buildWsTarget($('ws-host').value, $('ws-port').value);
    const password = $('ws-pass').value || '';
    $('ws-host').value = host;
    $('ws-port').value = port;
    cfg.ws = { host, port, password };
    Deck.saveCfg();
    Deck.setConn('wait', 'Connecting…');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { Deck.setConn('bad', 'Bad WS URL'); Deck.setMsg(e.message); return; }
    obs.ws = ws;
    ws.onclose = (ev) => {
      if (obs.ws !== ws) return;
      obs.ws = null;
      for (const p of obs.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Closed')); }
      obs.pending.clear();
      if (ev.code === 4009) {
        Deck.setConn('bad', 'Auth Failed');
        Deck.setMsg('OBS WebSocket password rejected');
        $('conn-bar').classList.add('open');
        return;
      }
      Deck.setConn('bad', 'Disconnected');
      if (!obs.manualClose) obs.reconnectTimer = setTimeout(Deck.connectObs, 3000);
    };
    ws.onmessage = async (ev) => {
      if (obs.ws !== ws) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.op === 0) {
        const d = { rpcVersion: 1, eventSubscriptions: 2047 };
        if (msg.d?.authentication) {
          const { challenge, salt } = msg.d.authentication;
          d.authentication = sha256Base64(sha256Base64(password + salt) + challenge);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        Deck.setConn('ok', 'Connected');
        Deck.setMsg(`Connected to ${url}`);
        await Deck.syncObsState();
      } else if (msg.op === 5) {
        await handleObsEvent(msg.d?.eventType, msg.d?.eventData || {});
      } else if (msg.op === 7) {
        const p = obs.pending.get(msg.d?.requestId);
        if (!p) return;
        obs.pending.delete(msg.d.requestId);
        clearTimeout(p.timer);
        if (msg.d.requestStatus?.result) p.resolve(msg.d.responseData || {});
        else p.reject(new Error(`${p.requestType}: ${msg.d.requestStatus?.comment || msg.d.requestStatus?.code}`));
      }
    };
  };

  window.Deck = Deck;
})();

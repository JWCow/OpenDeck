(function () {
  var dP = null;
  function desk() {
    if (!dP) dP = (window.claude && window.claude.use) ? window.claude.use('desktop').catch(function () { return null; }) : Promise.resolve(null);
    return dP;
  }
  function say(m) { if (window.Deck && Deck.setMsg) Deck.setMsg(m); }
  function drawIcon() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    function rr(x, y, w, h, r, fill) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); }
    rr(0, 0, 256, 256, 56, '#0b0c0f');
    rr(40, 40, 80, 80, 20, '#eceef2');
    rr(136, 40, 80, 80, 20, 'rgba(236,238,242,0.3)');
    rr(40, 136, 80, 80, 20, 'rgba(236,238,242,0.3)');
    rr(136, 136, 80, 80, 20, '#ff4d3d');
    return c.toDataURL('image/png');
  }

  // Ask for full access from a click when it has not been granted yet.
  function offerAccess(d) {
    if (document.getElementById('da-access')) return;
    var b = document.createElement('button');
    b.id = 'da-access'; b.className = 'btn sm'; b.textContent = 'Allow OBS connection';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999';
    b.onclick = function () {
      d.permissions.request(['full-access']).then(function (s) {
        if (s['full-access'] === 'granted') location.reload();
        else if (s['full-access'] === 'denied') d.permissions.manage().catch(function () {});
      }).catch(console.error);
    };
    (document.body || document.documentElement).appendChild(b);
  }

  var scriptP = null;
  function bridgeScript(d) {
    if (!scriptP) scriptP = d.os.tmpdir().then(function (t) {
      var p = t.replace(/[\\/]+$/, '') + '\\opendeck-obs-bridge.ps1';
      return d.fs.writeFile(p, BRIDGE_PS1, 'utf8').then(function () { return p; });
    }).catch(function (e) { scriptP = null; throw e; });
    return scriptP;
  }

  // WebSocket stand-in: obs-ws.js only uses on* handlers, send, close and readyState.
  function BridgeSocket(url) {
    var self = this;
    this.url = url; this.readyState = 0; this.protocol = ''; this.extensions = ''; this.binaryType = 'blob';
    this.onopen = this.onmessage = this.onerror = this.onclose = null;
    this._p = null; this._buf = ''; this._closed = false;
    desk().then(function (d) {
      if (!d || !d.childProcess) return self._finish(1006, 'OBS connection works only in the installed app');
      return d.permissions.state('full-access').then(function (st) {
        if (st !== 'granted') { offerAccess(d); return self._finish(1006, 'Allow full access to connect to OBS'); }
        return bridgeScript(d).then(function (path) {
          if (self._closed) return;
          var p = d.childProcess.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path, url]);
          self._p = p;
          p.stdout.on('data', function (chunk) { self._data(chunk); });
          p.on('error', function (e) { self._finish(1006, String((e && e.message) || e)); });
          p.on('exit', function () { self._finish(1006, 'bridge exited'); });
        });
      });
    }).catch(function (e) { self._finish(1006, String((e && e.message) || e)); });
  }
  BridgeSocket.CONNECTING = 0; BridgeSocket.OPEN = 1; BridgeSocket.CLOSING = 2; BridgeSocket.CLOSED = 3;
  BridgeSocket.prototype._data = function (chunk) {
    this._buf += chunk;
    var i;
    while ((i = this._buf.indexOf('\n')) >= 0) {
      var line = this._buf.slice(0, i).replace(/\r$/, '');
      this._buf = this._buf.slice(i + 1);
      if (this.readyState === 3) return;
      if (line === 'O') { this.readyState = 1; if (this.onopen) this.onopen({ type: 'open' }); }
      else if (line.slice(0, 2) === 'M ') { if (this.onmessage) this.onmessage({ type: 'message', data: line.slice(2) }); }
      else if (line.slice(0, 2) === 'C ') {
        var m = /^C (\d+) ?(.*)$/.exec(line) || [];
        this._finish(Number(m[1]) || 1006, m[2] || '');
      }
    }
  };
  BridgeSocket.prototype._finish = function (code, reason) {
    if (this.readyState === 3) return;
    var wasOpen = this.readyState === 1;
    this.readyState = 3; this._closed = true;
    if (this._p) { var p = this._p; this._p = null; setTimeout(function () { p.kill().catch(function () {}); }, 500); }
    var self = this;
    setTimeout(function () {
      if (!wasOpen && code === 1006 && self.onerror) self.onerror({ type: 'error' });
      if (self.onclose) self.onclose({ type: 'close', code: code, reason: reason, wasClean: code === 1000 });
    }, 0);
  };
  BridgeSocket.prototype.send = function (data) {
    if (this.readyState !== 1) throw new Error('InvalidStateError: socket is not open');
    this._p.stdin.write(String(data).replace(/\r?\n/g, ' ') + '\n').catch(function () {});
  };
  BridgeSocket.prototype.close = function () {
    if (this.readyState >= 2) return;
    this._closed = true;
    if (this._p && this.readyState === 1) { this.readyState = 2; this._p.stdin.write('X\n').catch(function () {}); }
    else this._finish(1000, 'closed');
  };
  BridgeSocket.prototype.addEventListener = function (t, fn) { this['on' + t] = fn; };
  BridgeSocket.prototype.removeEventListener = function () {};
  window.WebSocket = BridgeSocket;

  // Downloads (Export, screenshots) are blocked in the app: save to ~/Downloads instead.
  var blobs = {};
  var origCreate = URL.createObjectURL;
  URL.createObjectURL = function (o) { var u = origCreate.call(URL, o); if (o instanceof Blob) blobs[u] = o; return u; };
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var a = this, href = a.getAttribute('href') || '', name = a.download;
    if (!name || !(blobs[href] || /^data:/.test(href))) return origClick.call(a);
    desk().then(function (d) {
      if (!d || !d.fs) return origClick.call(a);
      var dataP = blobs[href]
        ? blobs[href].arrayBuffer().then(function (b) { return new Uint8Array(b); })
        : Promise.resolve(href.indexOf(';base64,') > 0
          ? Uint8Array.from(atob(href.split(',')[1]), function (c) { return c.charCodeAt(0); })
          : new TextEncoder().encode(decodeURIComponent(href.split(',')[1] || '')));
      var safe = String(name).replace(/[\\/:*?"<>|]/g, '_');
      return dataP.then(function (bytes) { return d.fs.writeFile('~/Downloads/' + safe, bytes); })
        .then(function () { return d.os.homedir(); })
        .then(function (h) {
          var full = h + '\\Downloads\\' + safe;
          say('Saved ' + full);
          return d.shell.showItemInFolder(full).catch(function () {});
        })
        .catch(function (e) { say('Save failed: ' + e.message); });
    });
  };

  desk().then(function (d) {
    if (d && d.app && d.app.dock) d.app.dock.setIcon(drawIcon()).catch(console.error);
  });
})();

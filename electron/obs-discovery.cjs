'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function getCandidatePaths() {
  const home = os.homedir();
  const candidates = [];

  if (process.env.OBS_WS_CONFIG) {
    candidates.push(process.env.OBS_WS_CONFIG);
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    candidates.push(
      path.join(appData, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      path.join(
        home,
        'Library',
        'Application Support',
        'obs-studio',
        'plugin_config',
        'obs-websocket',
        'config.json'
      )
    );
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    candidates.push(
      path.join(xdgConfig, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json'),
      path.join(
        home,
        '.var',
        'app',
        'com.obsproject.Studio',
        'config',
        'obs-studio',
        'plugin_config',
        'obs-websocket',
        'config.json'
      )
    );
  }

  return candidates;
}

function parseValidPort(raw) {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 && raw <= 65535 ? raw : null;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
  }
  return null;
}

/**
 * Read-only ADR-0002 OBS WebSocket config reader.
 * Returns only { port, enabled, source } and never reads, logs, or returns credentials.
 */
function discoverObsPort() {
  for (const configPath of getCandidatePaths()) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const rawText = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') continue;

      const enabled = parsed.server_enabled === true;
      const port = parseValidPort(parsed.server_port);
      return {
        port,
        enabled,
        source: configPath,
      };
    } catch {
      // Ignore unreadable or malformed config files and continue checking fallbacks.
    }
  }

  return {
    port: null,
    enabled: false,
    source: null,
  };
}

module.exports = {
  discoverObsPort,
  getCandidatePaths,
  parseValidPort,
};

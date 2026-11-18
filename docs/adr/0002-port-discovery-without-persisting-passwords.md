# 0002 — Port Auto-Discovery Without Persisting Plaintext Passwords

Status: accepted

The macOS and Windows setup helpers detect the local OBS WebSocket port from OBS's configuration and pass it to the Deck (alongside automatic fallback probing of common local ports), while never embedding or writing the OBS WebSocket password into the dock URL or disk files.

## Context & Trade-Off
Copying a `server_password` into the OBS Custom Browser Dock `file:///...?pass=...` URL or a sidecar config script would allow zero-prompt connection when authentication is enabled, but exposes the credential in OBS dock settings UI, screenshots, and unencrypted files. Detecting only the port and prompting once inside the Deck (stored in OBS's local browser storage) balances fast setup with credential hygiene.

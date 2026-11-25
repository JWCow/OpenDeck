<#
.SYNOPSIS
  OpenDeck Local Windows Hotkey Bridge (optional, zero external dependencies).
.DESCRIPTION
  Listens on http://127.0.0.1:3905/ and translates POST /hotkey JSON payloads
  into Win32 keybd_event keystrokes (for desktop apps without OBS API support,
  such as Snap Camera Ctrl+Alt+Shift+1..6).
#>
param(
  [int]$Port = 3905
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class OpenDeckWin32Key {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);

    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const byte VK_SHIFT   = 0x10;
    private const byte VK_CONTROL = 0x11;
    private const byte VK_MENU    = 0x12;

    private static void KeyDown(byte vk) {
        byte scan = (byte)(MapVirtualKey(vk, 0) & 0xFF);
        keybd_event(vk, scan, 0, UIntPtr.Zero);
    }

    private static void KeyUp(byte vk) {
        byte scan = (byte)(MapVirtualKey(vk, 0) & 0xFF);
        keybd_event(vk, scan, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void SendChord(byte vk, bool ctrl, bool alt, bool shift) {
        if (ctrl)  KeyDown(VK_CONTROL);
        if (alt)   KeyDown(VK_MENU);
        if (shift) KeyDown(VK_SHIFT);
        System.Threading.Thread.Sleep(15);
        KeyDown(vk);
        System.Threading.Thread.Sleep(15);
        KeyUp(vk);
        System.Threading.Thread.Sleep(10);
        if (shift) KeyUp(VK_SHIFT);
        if (alt)   KeyUp(VK_MENU);
        if (ctrl)  KeyUp(VK_CONTROL);
    }
}
"@

function Resolve-VirtualKey {
  param([object]$RawKey)
  if ($null -eq $RawKey) { return $null }
  if ($RawKey -is [int] -or $RawKey -is [long] -or $RawKey -is [byte]) {
    $n = [int]$RawKey
    if ($n -ge 1 -and $n -le 254) { return [byte]$n }
    return $null
  }
  $s = ([string]$RawKey).Trim().ToUpperInvariant()
  if (-not $s) { return $null }
  $s = $s -replace '^OBS_KEY_', ''
  if ($s.Length -eq 1) {
    $ch = [int][char]$s[0]
    if (($ch -ge 48 -and $ch -le 57) -or ($ch -ge 65 -and $ch -le 90)) {
      return [byte]$ch
    }
  }
  if ($s -match '^F([1-9]|1[0-9]|2[0-4])$') {
    $fn = [int]$Matches[1]
    return [byte](0x6F + $fn)
  }
  if ($s -match '^NUMPAD([0-9])$') {
    return [byte](0x60 + [int]$Matches[1])
  }
  $named = @{
    'ESC'       = 0x1B
    'ESCAPE'    = 0x1B
    'SPACE'     = 0x20
    'ENTER'     = 0x0D
    'RETURN'    = 0x0D
    'TAB'       = 0x09
    'BACKSPACE' = 0x08
    'DELETE'    = 0x2E
    'DEL'       = 0x2E
    'INSERT'    = 0x2D
    'HOME'      = 0x24
    'END'       = 0x23
    'PAGEUP'    = 0x21
    'PAGEDOWN'  = 0x22
    'LEFT'      = 0x25
    'UP'        = 0x26
    'RIGHT'     = 0x27
    'DOWN'      = 0x28
    'MINUS'     = 0xBD
    'PLUS'      = 0xBB
    'EQUAL'     = 0xBB
  }
  if ($named.ContainsKey($s)) { return [byte]$named[$s] }
  if ($s -match '^[0-9]{1,3}$') {
    $n = [int]$s
    if ($n -ge 1 -and $n -le 254) { return [byte]$n }
  }
  return $null
}

function Write-JsonResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [hashtable]$Payload
  )
  $Response.StatusCode = $StatusCode
  $Response.Headers['Access-Control-Allow-Origin'] = '*'
  $Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $Response.ContentType = 'application/json; charset=utf-8'
  $json = $Payload | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

$prefix = "http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host '============================================================'
Write-Host '  OpenDeck Local Windows Hotkey Bridge'
Write-Host "  Listening on: $prefix"
Write-Host '  Endpoints:    GET /health, POST /hotkey'
Write-Host '============================================================'
Write-Host 'Press Ctrl+C to stop.'
Write-Host ''

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      if ($req.HttpMethod -eq 'OPTIONS') {
        $res.StatusCode = 204
        $res.Headers['Access-Control-Allow-Origin'] = '*'
        $res.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        $res.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
        $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
        $res.OutputStream.Close()
        continue
      }

      $path = $req.Url.AbsolutePath.TrimEnd('/')
      if (-not $path) { $path = '/' }

      if ($req.HttpMethod -eq 'GET' -and ($path -eq '/health' -or $path -eq '/')) {
        Write-JsonResponse -Response $res -StatusCode 200 -Payload @{
          ok      = $true
          service = 'opendeck-hotkey-bridge'
          port    = $Port
        }
        continue
      }

      if ($req.HttpMethod -eq 'POST' -and $path -eq '/hotkey') {
        $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
        $bodyText = $reader.ReadToEnd()
        $reader.Dispose()

        $data = $null
        try {
          $data = $bodyText | ConvertFrom-Json
        } catch {
          Write-JsonResponse -Response $res -StatusCode 400 -Payload @{ ok = $false; error = 'Invalid JSON body' }
          continue
        }

        $vk = Resolve-VirtualKey -RawKey $data.key
        if ($null -eq $vk) {
          Write-JsonResponse -Response $res -StatusCode 400 -Payload @{ ok = $false; error = 'Missing or unsupported key' }
          continue
        }

        $ctrl = [bool]($data.ctrl -or $data.control)
        $alt = [bool]$data.alt
        $shift = [bool]$data.shift

        [OpenDeckWin32Key]::SendChord($vk, $ctrl, $alt, $shift)
        Write-JsonResponse -Response $res -StatusCode 200 -Payload @{
          ok    = $true
          key   = [string]$data.key
          vk    = [int]$vk
          ctrl  = $ctrl
          alt   = $alt
          shift = $shift
        }
        continue
      }

      Write-JsonResponse -Response $res -StatusCode 404 -Payload @{ ok = $false; error = 'Not found' }
    } catch {
      try {
        Write-JsonResponse -Response $res -StatusCode 500 -Payload @{ ok = $false; error = $_.Exception.Message }
      } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

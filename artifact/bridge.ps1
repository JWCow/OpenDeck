param([string]$Url)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
$none = [Threading.CancellationToken]::None
function Out([string]$s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
$ws = New-Object System.Net.WebSockets.ClientWebSocket
try { $ws.ConnectAsync([Uri]$Url, $none).Wait() } catch { Out 'C 1006 connect failed'; exit }
Out 'O'
$buf = New-Object byte[] 65536
$seg = New-Object 'System.ArraySegment[byte]' -ArgumentList (, $buf)
$ms = New-Object IO.MemoryStream
$rt = $ws.ReceiveAsync($seg, $none)
$sr = New-Object IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$it = $sr.ReadLineAsync()
while ($true) {
  $i = [Threading.Tasks.Task]::WaitAny([Threading.Tasks.Task[]]@($rt, $it))
  if ($i -eq 0) {
    if ($rt.IsFaulted) { Out 'C 1006 connection lost'; break }
    $r = $rt.Result
    if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      Out ("C " + [int]$ws.CloseStatus + " " + $ws.CloseStatusDescription); break
    }
    $ms.Write($buf, 0, $r.Count)
    if ($r.EndOfMessage) { Out ('M ' + [Text.Encoding]::UTF8.GetString($ms.ToArray())); $ms.SetLength(0) }
    $rt = $ws.ReceiveAsync($seg, $none)
  } else {
    $line = $it.Result
    if ($null -eq $line -or $line -eq 'X') {
      try { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $none).Wait(2000) | Out-Null } catch {}
      Out 'C 1000 closed'; break
    }
    $b = [Text.Encoding]::UTF8.GetBytes($line)
    $bs = New-Object 'System.ArraySegment[byte]' -ArgumentList (, $b)
    try { $ws.SendAsync($bs, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $none).Wait() } catch { Out 'C 1006 send failed'; break }
    $it = $sr.ReadLineAsync()
  }
}

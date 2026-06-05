' AMWALI Print Bridge - Windows 7 safe health check
' Uses MSXML2.XMLHTTP — works on Windows 7 without curl / Invoke-WebRequest.
' Exit code 0 = healthy, 1 = unreachable, 2 = responded but unhealthy.
Option Explicit
Dim http, body, code
code = 1
On Error Resume Next
' ServerXMLHTTP supports setTimeouts (resolve, connect, send, receive in ms).
' Falls back to MSXML2.XMLHTTP if ServerXMLHTTP is not available.
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
If Err.Number <> 0 Then
  Err.Clear
  Set http = CreateObject("MSXML2.XMLHTTP")
Else
  ' resolve=2s, connect=2s, send=2s, receive=4s — never hangs forever
  http.setTimeouts 2000, 2000, 2000, 4000
End If
http.open "GET", "http://127.0.0.1:3001/health", False
http.send
If Err.Number = 0 Then
  body = http.responseText
  If InStr(1, body, """status""", 1) > 0 And InStr(1, body, "ok", 1) > 0 Then
    WScript.Echo "[OK] Bridge is online"
    WScript.Echo body
    code = 0
  Else
    WScript.Echo "[WARN] Bridge responded but status is not ok"
    WScript.Echo body
    code = 2
  End If
Else
  WScript.Echo "[ERROR] Bridge did not respond on http://127.0.0.1:3001/health"
  WScript.Echo "  reason: " & Err.Description
  code = 1
End If
On Error Goto 0
WScript.Quit code
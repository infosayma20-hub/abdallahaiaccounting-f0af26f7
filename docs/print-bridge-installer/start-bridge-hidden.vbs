' AMWALI Print Bridge - Hidden Startup (Fallback only)
' Use this only if Windows Service installation failed.
' Preferred method: install-bridge.bat (Run as Administrator)

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

bridgeDir = "C:\print-bridge"
WshShell.CurrentDirectory = bridgeDir

scriptName = ""
If fso.FileExists(bridgeDir & "\print-bridge-v6.3.7-clean.js") Then
    scriptName = "print-bridge-v6.3.7-clean.js"
End If

If scriptName = "" Then
    MsgBox "AMWALI Print Bridge script not found in " & bridgeDir, 16, "AMWALI Print Bridge"
    WScript.Quit 1
End If

WshShell.Run "node " & scriptName, 0, False

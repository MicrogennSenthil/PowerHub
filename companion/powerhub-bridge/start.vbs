' PowerHub Bridge - Silent Launcher
' Starts the bridge as a hidden background process (no console window).
' To stop the bridge, right-click its icon in the system tray.
Dim fso, dir
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c cd /d """ & dir & """ && node bridge.js", 0, False

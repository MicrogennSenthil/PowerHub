param([int]$BridgePid, [string]$PowerhubUrl)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$tray = New-Object System.Windows.Forms.NotifyIcon

# Use a lightning-bolt style icon from built-in Windows icons
$tray.Icon = [System.Drawing.SystemIcons]::Shield
$tray.Text  = "PowerHub Bridge"
$tray.Visible = $true
$tray.BalloonTipTitle = "PowerHub Bridge"
$tray.BalloonTipText  = "Bridge is running in the background."
$tray.ShowBalloonTip(3000)

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$titleItem = $menu.Items.Add("PowerHub Bridge")
$titleItem.Enabled = $false
$titleItem.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)

$menu.Items.Add("-") | Out-Null

$urlItem = $menu.Items.Add("Server: $PowerhubUrl")
$urlItem.Enabled = $false

$menu.Items.Add("-") | Out-Null

$exitItem = $menu.Items.Add("Stop Bridge && Exit")
$exitItem.Add_Click({
    $tray.Visible = $false
    try { Stop-Process -Id $BridgePid -Force -ErrorAction SilentlyContinue } catch {}
    [System.Windows.Forms.Application]::Exit()
})

$tray.ContextMenuStrip = $menu

$tray.Add_DoubleClick({
    [System.Windows.Forms.MessageBox]::Show(
        "PowerHub Bridge is RUNNING`n`nForwarding to:`n$PowerhubUrl`n`nRight-click tray icon to stop.",
        "PowerHub Bridge",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
})

[System.Windows.Forms.Application]::Run()
$tray.Dispose()

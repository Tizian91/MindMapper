# Build js/outlook-sync-ps1.js from tools/outlook-sync.ps1.
#
# Run after every change of outlook-sync.ps1:
#   powershell -ExecutionPolicy Bypass -File tools\make_outlook_js.ps1
#
# The app puts the script into the project folder (Overview -> Appointments -> Outlook).
# It cannot fetch() tools/outlook-sync.ps1 when index.html is opened as a file (file://),
# but it may load a script - so the text travels inside a .js file, loaded on demand.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$text = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'outlook-sync.ps1'), [Text.Encoding]::UTF8)   # drops the BOM
$text = $text.Replace("`r`n", "`n")
$json = ConvertTo-Json $text -Compress
$js = "'use strict';`n" +
  "// generated from tools/outlook-sync.ps1 by tools/make_outlook_js.ps1 - edit the .ps1, then build again`n" +
  "window.MM.OUTLOOK_SYNC_PS1 = $json;`n"
[IO.File]::WriteAllText((Join-Path $root 'js\outlook-sync-ps1.js'), $js, (New-Object Text.UTF8Encoding $false))
Write-Host "ok js/outlook-sync-ps1.js ($($text.Length) characters)"

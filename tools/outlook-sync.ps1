<#
.SYNOPSIS
  Überträgt Fristen und Termine aus MindMapper in den Outlook-Kalender (nur in diese Richtung).

.DESCRIPTION
  Liest alle *.mindmap.json im Planungsordner (nur lesend) und gleicht sie mit den
  Outlook-Einträgen der Kategorie "MindMapper" ab: neue anlegen, geänderte anpassen,
  verschwundene löschen. Andere Outlook-Einträge werden nie angefasst.

    Frist  (deadline)               -> ganztägig, "⏰ Titel", als frei, Erinnerung eine Woche
                                       vorher 9:00, danach am Vortag 9:00
    Termin (scheduled + Uhrzeit)    -> von Uhrzeit für die Dauer des Aufwands (sonst 30 min),
                                       als gebucht, Erinnerung 15 min vorher
    Termin (scheduled, ohne Uhrzeit)-> ganztägig, als frei, Erinnerung am Vortag 9:00

  Unteraufgaben (Pfeil von der Hauptaufgabe oder in einer aus ihr abgeleiteten Karte):
  mit derselben Frist wie die Hauptaufgabe nur die Hauptaufgabe, sonst "Titel (zu: Hauptaufgabe)".
  Vergangenes wird übertragen, aber ohne Erinnerung. Alle Einträge sind als privat markiert.

  Daten: Das Skript liest nur den Planungsordner und schreibt nur in den Outlook-Kalender.
  Es baut selbst keine Internetverbindung auf; Outlook gleicht die Einträge wie jeden
  anderen Termin mit deinem eigenen Postfach ab. Das Protokoll enthält nur Zeit und Anzahlen.

  Nicht übertragen: Routinen (Serientermine legst du in Outlook an), erledigte oder
  verworfene Fristen, verworfene Termine, Einträge der Aufgabenlisten von Plänen,
  übertragene Notizen (zählen in ihrer neuen Karte) und Konfliktkopien.

  Outlook erlaubt nur eine Erinnerung je Eintrag: Nach der Erinnerung eine Woche vorher
  setzt ein späterer Lauf sie auf den Vortag um. Dafür muss das Skript regelmäßig laufen.

  Ohne -Apply ist es ein Probelauf: Outlook wird nur gelesen, nichts geändert.
  Nur das klassische Outlook (Windows) ist ansteuerbar, nicht das "neue Outlook".

  Planungsordner: -Folder, sonst der Ordner des Skripts, wenn darin mindmapper.settings.json
  liegt (so legt die App es ab: Übersicht -> Termine -> Outlook-Abgleich), sonst Dokumente\Planung.

  -Menu        Auswahl: abgleichen, Probelauf, stündlich automatisch, Einträge entfernen
               (das startet "Outlook-Abgleich.cmd" im Planungsordner)
  -Quiet       ohne Ausgabe, Protokoll in %LOCALAPPDATA%\MindMapper\outlook-sync.log;
               läuft Outlook nicht, passiert nichts (für die Aufgabenplanung)
  -RemoveAll   alle MindMapper-Einträge aus Outlook entfernen (mit -Apply)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\outlook-sync.ps1
  powershell -ExecutionPolicy Bypass -File tools\outlook-sync.ps1 -Apply
  powershell -ExecutionPolicy Bypass -File tools\outlook-sync.ps1 -Folder "D:\Planung" -Apply
#>
param(
  [string]$Folder = '',
  [switch]$Apply,
  [switch]$Menu,
  [switch]$Quiet,
  [switch]$RemoveAll,
  [string]$Category = 'MindMapper'
)

if (-not $Folder) {
  $Folder = if ($PSScriptRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'mindmapper.settings.json'))) { $PSScriptRoot }
            else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Planung' }
}

$ErrorActionPreference = 'Stop'
$TaskName = 'MindMapper Outlook-Abgleich'
$LogDir = Join-Path $env:LOCALAPPDATA 'MindMapper'
$LogFile = Join-Path $LogDir 'outlook-sync.log'
$PropName = 'MindMapperId'
$Clock = [char]::ConvertFromUtf32(0x23F0)   # ⏰
$WeekBefore = 7 * 1440 - 9 * 60   # Minuten vor 0:00 des Tages = 7 Tage vorher, 9:00
$DayBefore = 1440 - 9 * 60       # Vortag, 9:00
$Now = Get-Date

# ---- MindMapper lesen --------------------------------------------------------------

function Get-Title([string]$text) {
  $line = ($text -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
  if (-not $line) { return '(ohne Titel)' }
  $t = $line.Trim()
  $t = $t -replace '^#+\s*', '' -replace '^[-*]\s+(\[[ xX]\]\s*)?', ''
  $t = $t -replace '\[([^\]]*)\]\([^)]*\)', '$1' -replace '(\*\*|__|`|~~)', ''
  return $t.Trim()
}

function Test-ConflictCopy([string]$name) {
  return $name -match '\[conflicted( \d+)?\]' -or $name -match '\((conflict|konflikt) \d{4}-\d\d-\d\d' -or $name -match 'conflicted copy'
}

function Test-Set($v) { return $v -and [string]$v -ne 'none' }

# Alle Aufgaben aller Karten (wie die Übersicht der App sie sieht, js/overview.js collect),
# auch die ohne Datum - sie können Hauptaufgabe sein. Dazu: Hauptaufgabe -> Unteraufgabe.
function Read-Tasks {
  $tasks = [ordered]@{}
  $links = New-Object System.Collections.ArrayList
  $root = (Resolve-Path $Folder).Path
  foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.mindmap.json') {
    if (Test-ConflictCopy $f.Name) { continue }
    $rel = $f.FullName.Substring($root.Length).TrimStart('\') -replace '\\', '/'
    try {
      $doc = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
    } catch {
      Write-Warning "Übersprungen (nicht lesbar): $rel"
      continue
    }
    if (-not $doc.nodes) { continue }
    $nodes = @{}
    foreach ($p in $doc.nodes.PSObject.Properties) { $nodes[$p.Name] = $p.Value }
    foreach ($n in $nodes.Values) {
      $m = $n.meta
      if (-not $m) { $m = [pscustomobject]@{} }
      if ($n.movedTo -or $n.repeat -or $n.taskList -or $n.type -eq 'diary') { continue }
      $deadline = [string]$m.deadline
      $scheduled = [string]$m.scheduled
      if ($scheduled -notmatch '^\d{4}-\d\d-\d\d$') { $scheduled = '' }
      if ($deadline -notmatch '^\d{4}-\d\d-\d\d$') { $deadline = '' }
      if ($scheduled) { $deadline = '' }   # wie in der App: der Termin gewinnt
      $status = [string]$m.status
      if (-not $status) { $status = 'none' }
      $prio = (Test-Set $m.priority) -or (Test-Set $m.quadrant)
      if ($n.type -eq 'todo') {
        # eine reine Checkliste ist keine Aufgabe (MM.meta.isTaskTodo)
        if (-not ($m.estimate -or $deadline -or $scheduled -or $prio -or @($n.tags) -contains 'carried-over')) { continue }
        # Einträge von Routinen (🔁) und Terminen (📌) sind Termine, keine Aufgaben (wie js/overview.js)
        $filled = @($n.items | Where-Object { $_ -and ([string]$_.text).Trim() -and -not $_.moved -and -not $_.routine })
        if (-not $filled.Count) { continue }   # leere Liste
        if ($status -eq 'none') { $status = if (@($filled | Where-Object { -not $_.done }).Count) { 'open' } else { 'done' } }
      } elseif (-not ($n.type -eq 'task' -or $status -ne 'none' -or $prio -or $deadline -or $scheduled)) {
        continue
      }
      $tasks["$rel#$($n.id)"] = [pscustomobject]@{
        Key = "$rel#$($n.id)"; Path = $rel; Id = [string]$n.id; Type = [string]$n.type; Status = $status
        Title = Get-Title ([string]$n.text); Deadline = $deadline; Scheduled = $scheduled
        Time = [string]$m.scheduledTime; Estimate = $m.estimate; Derived = [string]$n.derivedMap; Parent = $null
        AllDay = [bool]$m.allDay -and [bool]$scheduled; Until = [string]$m.scheduledUntil
      }
    }
    # Pfeil von Aufgabe A zu Aufgabe B: B ist Unteraufgabe von A
    foreach ($p in @($doc.edges.PSObject.Properties)) {
      $e = $p.Value
      $a = [string]$e.source.node; $b = [string]$e.target.node
      if (-not $a -or -not $b -or $a -eq $b) { continue }
      if ($nodes[$a].type -eq 'task' -and -not $nodes[$a].movedTo -and $nodes[$b].type -eq 'task' -and -not $nodes[$b].movedTo) {
        [void]$links.Add(@("$rel#$a", "$rel#$b"))
      }
    }
  }

  # wie js/overview.js buildTree: erste Hauptaufgabe gewinnt, keine Kreise
  $below = {
    param($key, $ancestor)
    for ($k = $key; $k; $k = $tasks[$k].Parent) { if ($k -eq $ancestor) { return $true } }
    return $false
  }
  $attach = {
    param($pk, $ck)
    $pt = $tasks[$pk]; $ct = $tasks[$ck]
    if (-not $pt -or -not $ct -or $ct.Parent -or (& $below $pk $ck)) { return }
    $ct.Parent = $pk
  }
  foreach ($l in $links) { & $attach $l[0] $l[1] }
  # aus Aufgabe A abgeleitete Karte: ihre obersten Aufgaben sind Unteraufgaben von A
  foreach ($t in @($tasks.Values)) {
    if ($t.Type -ne 'task' -or -not $t.Derived -or $t.Derived -eq $t.Path) { continue }
    foreach ($s in @($tasks.Values)) {
      if ($s.Path -eq $t.Derived -and $s.Type -eq 'task' -and -not $s.Parent) { & $attach $t.Key $s.Key }
    }
  }
  return $tasks
}

# Kommt die Aufgabe nach Outlook? (Datum, nicht verworfen/zurückgestellt, Frist nicht erledigt)
function Test-Listed($t) {
  if (-not $t.Deadline -and -not $t.Scheduled) { return $false }
  if ($t.Status -eq 'dropped' -or $t.Status -eq 'deferred') { return $false }
  if ($t.Deadline -and $t.Status -eq 'done') { return $false }
  return $true
}

function Get-Wanted {
  $out = @{}
  $tasks = Read-Tasks
  foreach ($t in $tasks.Values) {
    if (-not (Test-Listed $t)) { continue }
    $parent = if ($t.Parent) { $tasks[$t.Parent] } else { $null }
    # Unteraufgabe mit derselben Frist wie ihre (übertragene) Hauptaufgabe: nur die Hauptaufgabe
    if ($parent -and $t.Deadline -and $parent.Deadline -eq $t.Deadline -and (Test-Listed $parent)) { continue }
    $title = $t.Title
    if ($parent) { $title += " (zu: $($parent.Title))" }
    $mapName = $t.Path -replace '\.mindmap\.json$', ''
    $deadline = $t.Deadline; $scheduled = $t.Scheduled
    $m = [pscustomobject]@{ scheduledTime = $t.Time; estimate = $t.Estimate; allDay = $t.AllDay; until = $t.Until }
    $w = [ordered]@{ Key = $t.Key; Map = $mapName; Kind = ''; Subject = ''; AllDay = $true; Start = $null; Minutes = 0; Busy = 0 }
    if ($deadline) {
        $w.Kind = 'Frist'
        $w.Subject = "$Clock $title"
        $w.Start = [datetime]::ParseExact($deadline, 'yyyy-MM-dd', $null)
        $w.Minutes = 1440
      } else {
        $w.Kind = 'Termin'
        $w.Subject = $title
        $time = [string]$m.scheduledTime
        if ($m.allDay) {
          # ganztägig, auch über mehrere Tage (bis einschließlich "until"): als gebucht
          $w.Start = [datetime]::ParseExact($scheduled, 'yyyy-MM-dd', $null)
          $days = 1
          if ($m.until -match '^\d{4}-\d\d-\d\d$') {
            $end = [datetime]::ParseExact($m.until, 'yyyy-MM-dd', $null)
            if ($end -gt $w.Start) { $days = [int](($end - $w.Start).TotalDays) + 1 }
          }
          $w.Minutes = 1440 * [math]::Min($days, 366)
          $w.Busy = 2
          if ($time -match '^\d\d:\d\d$') { $w.Subject = "$title (ab $time)" }   # Beginn nur als Hinweis
        } elseif ($time -match '^\d\d:\d\d$') {
          $w.AllDay = $false
          $w.Start = [datetime]::ParseExact("$scheduled $time", 'yyyy-MM-dd HH:mm', $null)
          $est = 0
          if ($m.estimate) { $est = [int][math]::Round([double]$m.estimate) }
          $w.Minutes = if ($est -gt 0) { $est } else { 30 }
          $w.Busy = 2
        } else {
          $w.Start = [datetime]::ParseExact($scheduled, 'yyyy-MM-dd', $null)
          $w.Minutes = 1440
        }
      }
      $w.Body = "Aus MindMapper: $mapName"
      $out[$w.Key] = [pscustomobject]$w
  }
  return $out
}

# ---- Erinnerung ---------------------------------------------------------------------

# Gewünschte Erinnerung in Minuten vor Beginn, oder $null für keine.
# $item: vorhandener Outlook-Eintrag oder $null.
function Get-Reminder($w, $item) {
  if ($w.AllDay) {
    $stages = if ($w.Kind -eq 'Frist') { @($WeekBefore, $DayBefore) } else { @($DayBefore) }
  } else {
    $stages = @(15)
  }
  # Vergangenes (auch offene, überfällige Fristen) ohne Erinnerung
  if ($Now -ge $w.Start.AddMinutes($w.Minutes)) { return $null }
  # eine gerade fällige (angezeigte, noch nicht geschlossene) Erinnerung nicht wegnehmen
  if ($item -and $item.ReminderSet -and $item.Start -eq $w.Start -and $stages -contains $item.ReminderMinutesBeforeStart) {
    $at = $w.Start.AddMinutes(-$item.ReminderMinutesBeforeStart)
    if ($at -le $Now -and $Now -lt $at.AddDays(2)) { return [int]$item.ReminderMinutesBeforeStart }
  }
  foreach ($s in $stages) {
    if ($Now -lt $w.Start.AddMinutes(-$s)) { return $s }
  }
  return $null
}

function Format-Reminder($min, $w) {
  if ($null -eq $min) { return 'keine' }
  return $w.Start.AddMinutes(-$min).ToString('ddd dd.MM. HH:mm')
}

# ---- Outlook ------------------------------------------------------------------------

function Get-Differences($w, $item, $rem) {
  $d = @()
  if ($item.Subject -ne $w.Subject) { $d += 'Titel' }
  if ([bool]$item.AllDayEvent -ne $w.AllDay) { $d += 'ganztägig' }
  if ($item.Start -ne $w.Start) { $d += 'Beginn' }
  if ([int]$item.Duration -ne $w.Minutes) { $d += 'Dauer' }
  if ([int]$item.BusyStatus -ne $w.Busy) { $d += 'Status' }
  if (([string]$item.Body).Trim() -ne $w.Body) { $d += 'Text' }
  if ([int]$item.Sensitivity -ne 2) { $d += 'privat' }
  $has = [bool]$item.ReminderSet
  if (($null -eq $rem) -eq $has -or ($has -and [int]$item.ReminderMinutesBeforeStart -ne $rem)) { $d += 'Erinnerung' }
  return $d
}

function Set-Item($item, $w, $rem) {
  $item.Subject = $w.Subject
  $item.AllDayEvent = $w.AllDay
  $item.Start = $w.Start
  $item.Duration = $w.Minutes
  $item.BusyStatus = $w.Busy
  $item.Body = $w.Body
  $item.Categories = $Category
  $item.Sensitivity = 2   # privat: wer deinen Kalender freigegeben hat, sieht keine Titel
  if ($null -eq $rem) {
    $item.ReminderSet = $false
  } else {
    $item.ReminderSet = $true
    $item.ReminderMinutesBeforeStart = $rem
  }
  $prop = $item.UserProperties.Find($PropName)
  if (-not $prop) { $prop = $item.UserProperties.Add($PropName, 1, $false) }   # 1 = Text
  $prop.Value = $w.Key
  $item.Save()
}

# ---- Abgleich -----------------------------------------------------------------------

function Out-Line([string]$text = '') { if (-not $Quiet) { Write-Host $text } }

function Out-Table($rows, [string[]]$cols) {
  if ($Quiet) { return }
  if (@($rows).Count) { $rows | Format-Table $cols -AutoSize -Wrap | Out-String -Width 200 | Write-Host } else { Write-Host '  -' }
}

function Write-Log([string]$text) {
  try {
    if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
    $lines = @()
    if (Test-Path -LiteralPath $LogFile) { $lines = @(Get-Content -LiteralPath $LogFile -Encoding UTF8 | Select-Object -Last 300) }
    $lines += (Get-Date -Format 'yyyy-MM-dd HH:mm') + '  ' + $text
    Set-Content -LiteralPath $LogFile -Value $lines -Encoding UTF8
  } catch { }
}

# Gleicht ab (oder zeigt nur an, $doApply = $false). $removeAll: alles entfernen.
# Gibt eine Zusammenfassung in einer Zeile zurück.
function Invoke-Sync([bool]$doApply, [bool]$removeAll) {
  $script:Now = Get-Date
  Out-Line ''
  if ($removeAll) {
    Out-Line ($(if ($doApply) { 'MindMapper-Einträge aus Outlook ENTFERNEN' } else { 'PROBELAUF: MindMapper-Einträge, die entfernt würden' }))
  } else {
    Out-Line ($(if ($doApply) { 'MindMapper -> Outlook: ABGLEICH' } else { 'MindMapper -> Outlook: PROBELAUF (Outlook wird nicht verändert)' }))
  }
  Out-Line "Planungsordner: $Folder"
  if (-not (Test-Path -LiteralPath $Folder)) { throw "Planungsordner nicht gefunden: $Folder" }

  $wanted = if ($removeAll) { @{} } else { Get-Wanted }

  $ol = New-Object -ComObject Outlook.Application
  $cal = $ol.Session.GetDefaultFolder(9)   # 9 = Kalender
  Out-Line "Kalender: $($cal.FolderPath)"

  $have = @{}
  $dupes = @()
  foreach ($item in @($cal.Items.Restrict("[Categories] = '$Category'"))) {
    $prop = $item.UserProperties.Find($PropName)
    if (-not $prop) { continue }   # von Hand kategorisiert: nicht unserer
    $k = [string]$prop.Value
    if ($have.ContainsKey($k)) { $dupes += $item } else { $have[$k] = $item }
  }

  $new = @(); $changed = @(); $same = 0; $gone = @()
  foreach ($w in ($wanted.Values | Sort-Object Start)) {
    $item = $have[$w.Key]
    $rem = Get-Reminder $w $item
    $row = [pscustomobject]@{
      Art = $w.Kind
      Datum = if ($w.AllDay) { $w.Start.ToString('ddd dd.MM.yyyy') } else { $w.Start.ToString('ddd dd.MM.yyyy HH:mm') + " ($($w.Minutes) min)" }
      Titel = $w.Subject
      Erinnerung = Format-Reminder $rem $w
      Karte = $w.Map
      Was = ''
    }
    if (-not $item) {
      $new += $row
      if ($doApply) { Set-Item $cal.Items.Add(1) $w $rem }
    } else {
      $diff = Get-Differences $w $item $rem
      if ($diff.Count) {
        $row.Was = $diff -join ', '
        $changed += $row
        if ($doApply) { Set-Item $item $w $rem }
      } else {
        $same++
      }
    }
  }
  foreach ($k in @($have.Keys)) {
    if ($wanted.ContainsKey($k)) { continue }
    $item = $have[$k]
    $gone += [pscustomobject]@{ Datum = $item.Start.ToString('ddd dd.MM.yyyy'); Titel = $item.Subject; Kennung = $k }
    if ($doApply) { $item.Delete() }
  }
  foreach ($item in $dupes) {
    $gone += [pscustomobject]@{ Datum = $item.Start.ToString('ddd dd.MM.yyyy'); Titel = $item.Subject; Kennung = '(doppelt)' }
    if ($doApply) { $item.Delete() }
  }

  $verb = if ($doApply) { '' } else { 'würde ' }
  if (-not $removeAll) {
    Out-Line ''
    Out-Line "NEU ($($new.Count)) - ${verb}angelegt:"
    Out-Table $new @('Art', 'Datum', 'Titel', 'Erinnerung', 'Karte')
    Out-Line "GEÄNDERT ($($changed.Count)) - ${verb}angepasst:"
    Out-Table $changed @('Art', 'Datum', 'Titel', 'Erinnerung', 'Was')
  }
  Out-Line "GELÖSCHT ($($gone.Count)) - ${verb}aus Outlook entfernt:"
  Out-Table $gone @('Datum', 'Titel', 'Kennung')
  if (-not $removeAll) { Out-Line "Unverändert: $same" }
  if (-not $doApply) {
    Out-Line ''
    Out-Line 'Probelauf: In Outlook wurde nichts geändert.'
  }
  return "$($new.Count) neu, $($changed.Count) geändert, $($gone.Count) gelöscht, $same unverändert"
}

# ---- Stündlicher Abgleich (Windows-Aufgabenplanung) ---------------------------------

function Get-SyncTask { return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }

function Install-SyncTask {
  $ps = Join-Path $PSHOME 'powershell.exe'
  # conhost --headless: kein Fenster, das jede Stunde kurz aufblitzt
  $arg = "--headless `"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Folder `"$Folder`" -Apply -Quiet"
  $action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument $arg
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description "Überträgt Fristen und Termine aus MindMapper ($Folder) stündlich in den Outlook-Kalender." -Force | Out-Null
}

function Remove-SyncTask { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }

# ---- Menü ---------------------------------------------------------------------------

function Show-Menu {
  while ($true) {
    $task = Get-SyncTask
    Write-Host ''
    Write-Host '=============================================='
    Write-Host ' MindMapper -> Outlook'
    Write-Host '=============================================='
    Write-Host " Planungsordner:      $Folder"
    Write-Host " Stündlich abgleichen: $(if ($task) { 'AN' } else { 'aus' })"
    if (Test-Path -LiteralPath $LogFile) {
      $last = Get-Content -LiteralPath $LogFile -Encoding UTF8 -Tail 1
      if ($last) { Write-Host " Letzter Lauf:        $last" }
    }
    Write-Host ''
    Write-Host ' [1] Jetzt abgleichen (Enter)'
    Write-Host ' [2] Probelauf: nur anzeigen, was sich ändern würde'
    Write-Host " [3] Stündlich automatisch abgleichen $(if ($task) { 'AUSschalten' } else { 'EINschalten' })"
    Write-Host ' [4] Alle MindMapper-Einträge aus Outlook entfernen'
    Write-Host ' [Q] Beenden'
    $c = (Read-Host ' Auswahl').Trim().ToLower()
    try {
      switch ($c) {
        { $_ -eq '' -or $_ -eq '1' } { $s = Invoke-Sync $true $false; Write-Log "von Hand: $s"; Write-Host "Fertig: $s" }
        '2' { [void](Invoke-Sync $false $false) }
        '3' {
          if ($task) {
            Remove-SyncTask
            Write-Host 'Stündlicher Abgleich ist ausgeschaltet.'
          } else {
            Install-SyncTask
            Write-Host 'Stündlicher Abgleich ist eingeschaltet. Er läuft unsichtbar, solange du angemeldet bist und Outlook offen ist.'
          }
        }
        '4' {
          [void](Invoke-Sync $false $true)
          if ((Read-Host ' Diese Einträge wirklich aus Outlook entfernen? (j/n)').Trim().ToLower() -eq 'j') {
            if ($task) { Remove-SyncTask; Write-Host 'Stündlicher Abgleich ausgeschaltet (er würde sie sonst wieder anlegen).' }
            $s = Invoke-Sync $true $true
            Write-Log "alle entfernt: $s"
          }
        }
        'q' { return }
        default { Write-Host 'Bitte 1, 2, 3, 4 oder Q.' }
      }
    } catch {
      Write-Host ''
      Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red
      if ($_.Exception.Message -match '80040154|Klasse nicht registriert|Class not registered') {
        Write-Host 'Outlook ist nicht ansteuerbar. Das geht nur mit dem klassischen Outlook, nicht mit dem "neuen Outlook".'
      }
    }
  }
}

# ---- Start --------------------------------------------------------------------------

if ($Menu) {
  Show-Menu
} elseif ($Quiet) {
  # Aufgabenplanung: nur wenn Outlook läuft - es nicht nebenbei unsichtbar starten
  if (-not (Get-Process -Name OUTLOOK -ErrorAction SilentlyContinue)) { exit 0 }
  try {
    $s = Invoke-Sync $Apply.IsPresent $RemoveAll.IsPresent
    Write-Log "$(if ($Apply) { 'automatisch' } else { 'Probelauf' }): $s"
  } catch {
    Write-Log "FEHLER: $($_.Exception.Message)"
    exit 1
  }
} else {
  $s = Invoke-Sync $Apply.IsPresent $RemoveAll.IsPresent
  if ($Apply) { Write-Log "von Hand: $s" } else { Out-Line 'Zum Übertragen mit -Apply starten.' }
}

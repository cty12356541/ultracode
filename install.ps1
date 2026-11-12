#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [switch]$Global,
  [switch]$SkillOnly,
  [switch]$NoGlobalRule,
  [string]$Target,
  [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Fail-Install {
  param([Parameter(Mandatory = $true)][string]$Message)
  [Console]::Error.WriteLine("[ultracode install.ps1] ERROR: $Message")
  exit 1
}

function Resolve-NormalizedPath {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$RawPath)
  $trimmed = if ($null -eq $RawPath) { '' } else { $RawPath.Trim() }
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    Fail-Install 'Path cannot be empty or whitespace.'
  }
  $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($trimmed)
  $root = [System.IO.Path]::GetPathRoot($full)
  $minLen = if ([string]::IsNullOrEmpty($root)) { 1 } else { $root.Length }
  while ($full.Length -gt $minLen -and ($full.EndsWith('\') -or $full.EndsWith('/'))) {
    $full = $full.Substring(0, $full.Length - 1)
  }
  return $full
}

function Assert-NotFilesystemRoot {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$RawPath,
    [Parameter(Mandatory = $true)][string]$NormalizedPath,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $rawTrimmed = if ($null -eq $RawPath) { '' } else { $RawPath.Trim() }
  if ([string]::IsNullOrWhiteSpace($rawTrimmed)) {
    Fail-Install "$Label cannot be empty or whitespace."
  }

  if (
    $rawTrimmed -match '^[/\\]+$' -or
    $rawTrimmed -match '^[A-Za-z]:[/\\]*$' -or
    $rawTrimmed -match '^/[A-Za-z]/*$' -or
    $rawTrimmed -match '^/mnt/[A-Za-z]/*$' -or
    $rawTrimmed -match '^(\\\\|//)[^/\\]+([/\\]+[^/\\]+)?[/\\]*$'
  ) {
    Fail-Install "$Label refuses to operate directly on filesystem or share root: $rawTrimmed"
  }

  $pathRoot = [System.IO.Path]::GetPathRoot($NormalizedPath)
  if (
    [string]::IsNullOrWhiteSpace($pathRoot) -or
    ($NormalizedPath.TrimEnd('\', '/') -ieq $pathRoot.TrimEnd('\', '/'))
  ) {
    Fail-Install "$Label refuses to operate directly on filesystem root: $NormalizedPath"
  }

  $parent = Split-Path -Parent $NormalizedPath
  if ([string]::IsNullOrWhiteSpace($parent)) {
    Fail-Install "$Label refuses to operate directly on root path: $NormalizedPath"
  }
}

function Resolve-GeminiHome {
  if (-not [string]::IsNullOrWhiteSpace($env:ULTRACODE_GEMINI_HOME)) {
    $rawOverride = $env:ULTRACODE_GEMINI_HOME.Trim()
    $normOverride = Resolve-NormalizedPath -RawPath $rawOverride
    Assert-NotFilesystemRoot -RawPath $rawOverride -NormalizedPath $normOverride -Label 'ULTRACODE_GEMINI_HOME'
    return $normOverride
  }

  $userHome = $env:USERPROFILE
  if ([string]::IsNullOrWhiteSpace($userHome)) {
    $userHome = $env:HOME
  }
  if ([string]::IsNullOrWhiteSpace($userHome)) {
    $userHome = [Environment]::GetFolderPath('UserProfile')
  }
  if ([string]::IsNullOrWhiteSpace($userHome)) {
    Fail-Install 'Unable to resolve user home directory; set ULTRACODE_GEMINI_HOME explicitly.'
  }

  $normUserHome = Resolve-NormalizedPath -RawPath $userHome
  $candidate = Join-Path $normUserHome '.gemini'
  $normGemHome = Resolve-NormalizedPath -RawPath $candidate
  Assert-NotFilesystemRoot -RawPath $candidate -NormalizedPath $normGemHome -Label 'GEMINI_HOME'
  return $normGemHome
}

function Remove-TreeSafe {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = Resolve-NormalizedPath -RawPath $Path
  Assert-NotFilesystemRoot -RawPath $Path -NormalizedPath $fullPath -Label 'Remove-TreeSafe'

  $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction SilentlyContinue
  if ($null -eq $item) {
    return
  }

  $isReparse = (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
  if ($isReparse) {
    if ($item.PSIsContainer) {
      if (($item.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
        $item.Attributes = ($item.Attributes -bxor [System.IO.FileAttributes]::ReadOnly)
      }
      [System.IO.Directory]::Delete($fullPath, $false)
    } else {
      if (($item.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
        [System.IO.File]::SetAttributes($fullPath, ($item.Attributes -bxor [System.IO.FileAttributes]::ReadOnly))
      }
      [System.IO.File]::Delete($fullPath)
    }
    return
  }

  if ($item.PSIsContainer) {
    $children = @(Get-ChildItem -LiteralPath $fullPath -Force -ErrorAction Stop)
    foreach ($child in $children) {
      Remove-TreeSafe -Path $child.FullName
    }
    $dirAfter = Get-Item -LiteralPath $fullPath -Force -ErrorAction SilentlyContinue
    if ($null -ne $dirAfter -and (($dirAfter.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0)) {
      $dirAfter.Attributes = ($dirAfter.Attributes -bxor [System.IO.FileAttributes]::ReadOnly)
    }
    [System.IO.Directory]::Delete($fullPath, $false)
  } else {
    if (($item.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
      [System.IO.File]::SetAttributes($fullPath, ($item.Attributes -bxor [System.IO.FileAttributes]::ReadOnly))
    }
    [System.IO.File]::Delete($fullPath)
  }
}

function Read-LogicalLines {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = Resolve-NormalizedPath -RawPath $Path
  if ([System.IO.Directory]::Exists($fullPath) -or (Test-Path -LiteralPath $fullPath -PathType Container)) {
    Fail-Install "Expected file but found directory at: $fullPath"
  }
  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  if ($bytes.Length -eq 0) {
    return ,([string[]]@())
  }
  $offset = 0
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $offset = 3
  }
  if ($bytes.Length - $offset -le 0) {
    return ,([string[]]@())
  }
  $text = $Utf8NoBom.GetString($bytes, $offset, $bytes.Length - $offset)
  $text = $text.Replace("`r`n", "`n").Replace("`r", "`n")
  if ($text.EndsWith("`n")) {
    $text = $text.Substring(0, $text.Length - 1)
  }
  if ($text.Length -eq 0) {
    return ,([string[]]@(''))
  }
  return ,([string[]]$text.Split([char]"`n"))
}

function Write-Utf8Lf {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content
  )
  $fullPath = Resolve-NormalizedPath -RawPath $Path
  if ([System.IO.Directory]::Exists($fullPath) -or (Test-Path -LiteralPath $fullPath -PathType Container)) {
    Fail-Install "Cannot write file because a directory exists at: $fullPath"
  }

  $parent = Split-Path -Parent $fullPath
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    [void][System.IO.Directory]::CreateDirectory($parent)
  }

  $nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
  $tmpPath = "$fullPath.tmp.$PID.$nonce"
  try {
    [System.IO.File]::WriteAllBytes($tmpPath, $Utf8NoBom.GetBytes($Content))
    $existingItem = Get-Item -LiteralPath $fullPath -Force -ErrorAction SilentlyContinue
    if ($null -ne $existingItem) {
      if ($existingItem.PSIsContainer) {
        Fail-Install "Cannot write file because a directory exists at: $fullPath"
      }
      if (($existingItem.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
        [System.IO.File]::SetAttributes($fullPath, ($existingItem.Attributes -bxor [System.IO.FileAttributes]::ReadOnly))
      }
      $isReparse = (($existingItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
      $replaced = $false
      if (-not $isReparse) {
        try {
          [System.IO.File]::Replace($tmpPath, $fullPath, [NullString]::Value, $true)
          $replaced = $true
        } catch [System.IO.IOException], [System.PlatformNotSupportedException], [System.UnauthorizedAccessException] {
          $replaced = $false
        }
      }
      if (-not $replaced) {
        $bakPath = "$fullPath.bak.$PID.$nonce"
        [System.IO.File]::Move($fullPath, $bakPath)
        try {
          [System.IO.File]::Move($tmpPath, $fullPath)
          if ([System.IO.File]::Exists($bakPath)) {
            [System.IO.File]::Delete($bakPath)
          }
        } catch {
          if (-not [System.IO.File]::Exists($fullPath) -and [System.IO.File]::Exists($bakPath)) {
            [System.IO.File]::Move($bakPath, $fullPath)
          }
          throw
        }
      }
    } else {
      [System.IO.File]::Move($tmpPath, $fullPath)
    }
  } finally {
    if ([System.IO.File]::Exists($tmpPath)) {
      [System.IO.File]::Delete($tmpPath)
    }
  }
}

function Inspect-UltracodeMarkers {
  param(
    [AllowEmptyCollection()][AllowEmptyString()][string[]]$Lines = @(),
    [Parameter(Mandatory = $true)][string]$SourceLabel
  )
  $inBlock = $false
  $blockCount = 0
  $firstBegin = -1
  $isUc = New-Object bool[] $Lines.Count

  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $line = $Lines[$i]
    if ($line -match '^[ \t]*<!--[ \t]*ultracode:begin([ \t]|-->|$)') {
      if ($inBlock) {
        Fail-Install "Corrupt marker in ${SourceLabel} (line $($i + 1)): nested or unclosed <!-- ultracode:begin --> block."
      }
      if ($line -notmatch '^[ \t]*<!--[ \t]*ultracode:begin([ \t][^>]*)?-->[ \t]*$') {
        Fail-Install "Corrupt marker in ${SourceLabel} (line $($i + 1)): malformed <!-- ultracode:begin --> tag."
      }
      $inBlock = $true
      $blockCount++
      if ($firstBegin -lt 0) {
        $firstBegin = $i
      }
      $isUc[$i] = $true
    } elseif ($line -match '^[ \t]*<!--[ \t]*ultracode:end([ \t]|-->|$)') {
      if (-not $inBlock) {
        Fail-Install "Corrupt marker in ${SourceLabel} (line $($i + 1)): orphan <!-- ultracode:end --> without matching begin."
      }
      if ($line -notmatch '^[ \t]*<!--[ \t]*ultracode:end[ \t]*-->[ \t]*$') {
        Fail-Install "Corrupt marker in ${SourceLabel} (line $($i + 1)): malformed <!-- ultracode:end --> tag."
      }
      $isUc[$i] = $true
      $inBlock = $false
    } else {
      $isUc[$i] = $inBlock
    }
  }

  if ($inBlock) {
    Fail-Install "Corrupt marker in ${SourceLabel}: found <!-- ultracode:begin ... --> without matching <!-- ultracode:end -->. Refusing to modify file."
  }

  return [PSCustomObject]@{
    BlockCount = $blockCount
    FirstBegin = $firstBegin
    IsUc       = $isUc
  }
}

function Extract-SourceBlockLines {
  param([Parameter(Mandatory = $true)][string]$GlobalRuleFile)
  $fullSrc = Resolve-NormalizedPath -RawPath $GlobalRuleFile
  if (-not (Test-Path -LiteralPath $fullSrc -PathType Leaf)) {
    Fail-Install "Missing source global rule file: $fullSrc"
  }
  $srcLines = Read-LogicalLines -Path $fullSrc
  $scan = Inspect-UltracodeMarkers -Lines $srcLines -SourceLabel $fullSrc
  if ($scan.BlockCount -ne 1) {
    Fail-Install "Expected exactly 1 ultracode marker block in $fullSrc, found $($scan.BlockCount)."
  }
  $extracted = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $srcLines.Count; $i++) {
    if ($scan.IsUc[$i]) {
      $extracted.Add($srcLines[$i])
    }
  }
  return ,([string[]]$extracted.ToArray())
}

function Upsert-UltracodeBlock {
  param(
    [Parameter(Mandatory = $true)][string]$DestAgentsPath,
    [AllowEmptyCollection()][AllowEmptyString()][string[]]$BlockLines = @()
  )
  $fullDest = Resolve-NormalizedPath -RawPath $DestAgentsPath
  if ([System.IO.Directory]::Exists($fullDest) -or (Test-Path -LiteralPath $fullDest -PathType Container)) {
    Fail-Install "Cannot update AGENTS.md because a directory exists at: $fullDest"
  }

  $blockText = [string]::Join("`n", $BlockLines)
  if (-not (Test-Path -LiteralPath $fullDest -PathType Leaf)) {
    Write-Utf8Lf -Path $fullDest -Content ($blockText + "`n")
    return
  }

  $lines = Read-LogicalLines -Path $fullDest
  $scan = Inspect-UltracodeMarkers -Lines $lines -SourceLabel $fullDest

  if ($scan.BlockCount -eq 0) {
    $lastNonEmpty = -1
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
      if ($lines[$i].Length -gt 0) {
        $lastNonEmpty = $i
        break
      }
    }
    if ($lastNonEmpty -lt 0) {
      Write-Utf8Lf -Path $fullDest -Content ($blockText + "`n")
    } else {
      $kept = [string[]]@($lines[0..$lastNonEmpty])
      $merged = ([string]::Join("`n", $kept)) + "`n`n" + $blockText + "`n"
      Write-Utf8Lf -Path $fullDest -Content $merged
    }
    return
  }

  $outList = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $scan.FirstBegin; $i++) {
    $outList.Add($lines[$i])
  }
  foreach ($bLine in $BlockLines) {
    $outList.Add($bLine)
  }
  for ($i = $scan.FirstBegin; $i -lt $lines.Count; $i++) {
    if (-not $scan.IsUc[$i]) {
      $outList.Add($lines[$i])
    }
  }
  while ($outList.Count -gt 0 -and $outList[$outList.Count - 1].Length -eq 0) {
    $outList.RemoveAt($outList.Count - 1)
  }
  $finalContent = ([string]::Join("`n", $outList.ToArray())) + "`n"
  Write-Utf8Lf -Path $fullDest -Content $finalContent
}

function Remove-UltracodeBlock {
  param([Parameter(Mandatory = $true)][string]$DestAgentsPath)
  $fullDest = Resolve-NormalizedPath -RawPath $DestAgentsPath
  if ([System.IO.Directory]::Exists($fullDest) -or (Test-Path -LiteralPath $fullDest -PathType Container)) {
    Fail-Install "Cannot strip AGENTS.md because a directory exists at: $fullDest"
  }
  if (-not (Test-Path -LiteralPath $fullDest -PathType Leaf)) {
    return
  }

  $lines = Read-LogicalLines -Path $fullDest
  $scan = Inspect-UltracodeMarkers -Lines $lines -SourceLabel $fullDest
  if ($scan.BlockCount -eq 0) {
    return
  }

  $before = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $scan.FirstBegin; $i++) {
    $before.Add($lines[$i])
  }
  while ($before.Count -gt 0 -and $before[$before.Count - 1].Length -eq 0) {
    $before.RemoveAt($before.Count - 1)
  }

  $after = New-Object System.Collections.Generic.List[string]
  for ($i = $scan.FirstBegin; $i -lt $lines.Count; $i++) {
    if (-not $scan.IsUc[$i]) {
      $after.Add($lines[$i])
    }
  }
  while ($after.Count -gt 0 -and $after[0].Length -eq 0) {
    $after.RemoveAt(0)
  }
  while ($after.Count -gt 0 -and $after[$after.Count - 1].Length -eq 0) {
    $after.RemoveAt($after.Count - 1)
  }

  if ($before.Count -gt 0 -and $after.Count -gt 0) {
    $restored = ([string]::Join("`n", $before.ToArray())) + "`n`n" + ([string]::Join("`n", $after.ToArray())) + "`n"
    Write-Utf8Lf -Path $fullDest -Content $restored
  } elseif ($before.Count -gt 0) {
    $restored = ([string]::Join("`n", $before.ToArray())) + "`n"
    Write-Utf8Lf -Path $fullDest -Content $restored
  } elseif ($after.Count -gt 0) {
    $restored = ([string]::Join("`n", $after.ToArray())) + "`n"
    Write-Utf8Lf -Path $fullDest -Content $restored
  } else {
    Write-Utf8Lf -Path $fullDest -Content ''
  }
}

function Assert-SkillPayloadExists {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $required = @(
    (Join-Path $RepoRoot 'skills\ultracode\SKILL.md'),
    (Join-Path $RepoRoot 'skills\ultracode\references\prompt-templates.md'),
    (Join-Path $RepoRoot 'skills\ultracode\references\quality-patterns-and-playbooks.md')
  )
  foreach ($item in $required) {
    if (-not (Test-Path -LiteralPath $item -PathType Leaf)) {
      Fail-Install "Missing required skill file: $item"
    }
  }
}

function Unlink-IfReparseOrFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = Resolve-NormalizedPath -RawPath $Path
  $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction SilentlyContinue
  if ($null -eq $item) {
    return
  }
  $isReparse = (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
  if ($isReparse -or (-not $item.PSIsContainer)) {
    Remove-TreeSafe -Path $fullPath
  }
}

function Test-SamePhysicalDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$PathA,
    [Parameter(Mandatory = $true)][string]$PathB
  )
  $fullA = Resolve-NormalizedPath -RawPath $PathA
  $fullB = Resolve-NormalizedPath -RawPath $PathB
  $itemA = Get-Item -LiteralPath $fullA -Force -ErrorAction SilentlyContinue
  $itemB = Get-Item -LiteralPath $fullB -Force -ErrorAction SilentlyContinue
  if ($null -eq $itemA -or $null -eq $itemB) {
    return $false
  }
  if ((-not $itemA.PSIsContainer) -or (-not $itemB.PSIsContainer)) {
    return $false
  }
  if ((($itemA.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) -or
      (($itemB.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
    return $false
  }
  if ([System.IO.Path]::DirectorySeparatorChar -eq '\') {
    return ($fullA.TrimEnd('\', '/') -ieq $fullB.TrimEnd('\', '/'))
  }
  return ($fullA.TrimEnd('/') -ceq $fullB.TrimEnd('/'))
}

function Sync-SkillTree {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$DestSkillDir
  )
  $srcSkillDir = Resolve-NormalizedPath -RawPath (Join-Path $RepoRoot 'skills\ultracode')
  $fullDestSkill = Resolve-NormalizedPath -RawPath $DestSkillDir

  Unlink-IfReparseOrFile -Path $fullDestSkill

  if (Test-SamePhysicalDirectory -PathA $srcSkillDir -PathB $fullDestSkill) {
    return
  }

  if (-not (Test-SamePhysicalDirectory -PathA $RepoRoot -PathB $fullDestSkill)) {
    Remove-TreeSafe -Path $fullDestSkill
  }

  $destRefs = Join-Path $fullDestSkill 'references'
  [void][System.IO.Directory]::CreateDirectory($destRefs)

  Copy-Item -LiteralPath (Join-Path $srcSkillDir 'SKILL.md') -Destination (Join-Path $fullDestSkill 'SKILL.md') -Force
  $srcRefs = Join-Path $srcSkillDir 'references'
  Get-ChildItem -LiteralPath $srcRefs -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destRefs $_.Name) -Force
  }
}

try {
  $rawRepoRoot = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($rawRepoRoot)) {
    $rawRepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
  }
  $RepoRoot = Resolve-NormalizedPath -RawPath $rawRepoRoot

  $targetBound = $PSBoundParameters.ContainsKey('Target')
  if ($targetBound -and [string]::IsNullOrWhiteSpace($Target)) {
    Fail-Install '-Target requires a non-empty workspace directory path.'
  }

  $explicitModes = 0
  if ($Global.IsPresent) { $explicitModes++ }
  if ($SkillOnly.IsPresent) { $explicitModes++ }
  if ($targetBound) { $explicitModes++ }
  if ($Uninstall.IsPresent) { $explicitModes++ }
  if ($explicitModes -gt 1) {
    Fail-Install 'Modes -Global, -SkillOnly, -Target, and -Uninstall are mutually exclusive.'
  }

  $mode = 'Global'
  if ($SkillOnly.IsPresent) { $mode = 'SkillOnly' }
  elseif ($targetBound) { $mode = 'Target' }
  elseif ($Uninstall.IsPresent) { $mode = 'Uninstall' }

  $globalRuleSrc = Join-Path $RepoRoot 'AGENTS.global.md'

  switch ($mode) {
    'Uninstall' {
      $geminiHome = Resolve-GeminiHome
      $agentsMd = Join-Path $geminiHome 'AGENTS.md'
      Remove-UltracodeBlock -DestAgentsPath $agentsMd

      $pluginDir = Join-Path $geminiHome 'config\plugins\ultracode'
      $skillDir = Join-Path $geminiHome 'config\skills\ultracode'
      Remove-TreeSafe -Path $pluginDir
      Remove-TreeSafe -Path $skillDir
      Write-Output "[ultracode] Uninstalled from $geminiHome"
    }

    'Target' {
      $resolvedTarget = Resolve-NormalizedPath -RawPath $Target
      Assert-NotFilesystemRoot -RawPath $Target -NormalizedPath $resolvedTarget -Label '-Target'
      if (-not (Test-Path -LiteralPath $resolvedTarget -PathType Container)) {
        Fail-Install "Target workspace directory does not exist: $Target"
      }

      Assert-SkillPayloadExists -RepoRoot $RepoRoot
      $blockLines = Extract-SourceBlockLines -GlobalRuleFile $globalRuleSrc

      $targetAgents = Join-Path $resolvedTarget 'AGENTS.md'
      Upsert-UltracodeBlock -DestAgentsPath $targetAgents -BlockLines $blockLines

      Unlink-IfReparseOrFile -Path (Join-Path $resolvedTarget '.agents')
      Unlink-IfReparseOrFile -Path (Join-Path $resolvedTarget '.agents\skills')
      $targetSkillDir = Join-Path $resolvedTarget '.agents\skills\ultracode'
      Sync-SkillTree -RepoRoot $RepoRoot -DestSkillDir $targetSkillDir
      Write-Output "[ultracode] Installed workspace bundle into $resolvedTarget"
    }

    'SkillOnly' {
      $geminiHome = Resolve-GeminiHome
      Assert-SkillPayloadExists -RepoRoot $RepoRoot

      if (-not $NoGlobalRule.IsPresent) {
        $blockLines = Extract-SourceBlockLines -GlobalRuleFile $globalRuleSrc
        $agentsMd = Join-Path $geminiHome 'AGENTS.md'
        Upsert-UltracodeBlock -DestAgentsPath $agentsMd -BlockLines $blockLines
      }

      Unlink-IfReparseOrFile -Path (Join-Path $geminiHome 'config')
      Unlink-IfReparseOrFile -Path (Join-Path $geminiHome 'config\skills')
      $skillDir = Join-Path $geminiHome 'config\skills\ultracode'
      Sync-SkillTree -RepoRoot $RepoRoot -DestSkillDir $skillDir

      $pluginDir = Join-Path $geminiHome 'config\plugins\ultracode'
      Unlink-IfReparseOrFile -Path $pluginDir
      if (-not (Test-SamePhysicalDirectory -PathA $RepoRoot -PathB $pluginDir)) {
        Remove-TreeSafe -Path $pluginDir
      }
      Write-Output "[ultracode] Installed skill-only bundle into $skillDir"
    }

    'Global' {
      $geminiHome = Resolve-GeminiHome
      Assert-SkillPayloadExists -RepoRoot $RepoRoot
      $pluginJsonSrc = Join-Path $RepoRoot 'plugin.json'
      $logoSvgSrc = Join-Path $RepoRoot 'assets\logo.svg'
      if (-not (Test-Path -LiteralPath $pluginJsonSrc -PathType Leaf)) {
        Fail-Install "Missing required plugin manifest: $pluginJsonSrc"
      }
      if (-not (Test-Path -LiteralPath $logoSvgSrc -PathType Leaf)) {
        Fail-Install "Missing required plugin logo: $logoSvgSrc"
      }

      if (-not $NoGlobalRule.IsPresent) {
        $blockLines = Extract-SourceBlockLines -GlobalRuleFile $globalRuleSrc
        $agentsMd = Join-Path $geminiHome 'AGENTS.md'
        Upsert-UltracodeBlock -DestAgentsPath $agentsMd -BlockLines $blockLines
      }

      Unlink-IfReparseOrFile -Path (Join-Path $geminiHome 'config')
      Unlink-IfReparseOrFile -Path (Join-Path $geminiHome 'config\plugins')
      $pluginDir = Join-Path $geminiHome 'config\plugins\ultracode'
      Unlink-IfReparseOrFile -Path $pluginDir

      if (-not (Test-SamePhysicalDirectory -PathA $RepoRoot -PathB $pluginDir)) {
        Unlink-IfReparseOrFile -Path (Join-Path $pluginDir 'assets')
        Unlink-IfReparseOrFile -Path (Join-Path $pluginDir 'skills')
        $pluginAssetsDir = Join-Path $pluginDir 'assets'
        [void][System.IO.Directory]::CreateDirectory($pluginAssetsDir)

        Copy-Item -LiteralPath $pluginJsonSrc -Destination (Join-Path $pluginDir 'plugin.json') -Force
        Copy-Item -LiteralPath $logoSvgSrc -Destination (Join-Path $pluginAssetsDir 'logo.svg') -Force

        $readmeSrc = Join-Path $RepoRoot 'README.md'
        $readmeDest = Join-Path $pluginDir 'README.md'
        if (Test-Path -LiteralPath $readmeSrc -PathType Leaf) {
          Copy-Item -LiteralPath $readmeSrc -Destination $readmeDest -Force
        } else {
          Remove-TreeSafe -Path $readmeDest
        }

        Sync-SkillTree -RepoRoot $RepoRoot -DestSkillDir (Join-Path $pluginDir 'skills\ultracode')
      }

      $pluginRulesDir = Join-Path $pluginDir 'rules'
      Remove-TreeSafe -Path $pluginRulesDir

      $legacySkillDir = Join-Path $geminiHome 'config\skills\ultracode'
      Unlink-IfReparseOrFile -Path $legacySkillDir
      if (-not (Test-SamePhysicalDirectory -PathA $RepoRoot -PathB $legacySkillDir)) {
        Remove-TreeSafe -Path $legacySkillDir
      }
      Write-Output "[ultracode] Installed global plugin bundle into $pluginDir"
    }
  }
} catch {
  Fail-Install $_.Exception.Message
}

param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$target = (Resolve-Path -LiteralPath $Directory).Path
$existingWordIds = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$word = New-Object -ComObject Word.Application
$automationWordIds = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $existingWordIds } | Select-Object -ExpandProperty Id)
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$results = @()
try {
  foreach ($file in Get-ChildItem -LiteralPath $target -Filter '*.docx' -File) {
    Write-Output ('Checking Word layout: ' + $file.Name)
    $document = $null
    try {
      $document = $word.Documents.Open($file.FullName, $false, $true, $false)
      $null = $document.Fields.Update()
      foreach ($toc in $document.TablesOfContents) { $toc.Update() }
      $document.Repaginate()
      foreach ($story in $document.StoryRanges) {
        $range = $story
        while ($null -ne $range) { $null = $range.Fields.Update(); $range = $range.NextStoryRange }
      }
      foreach ($toc in $document.TablesOfContents) { $toc.UpdatePageNumbers() }
      $document.Repaginate()
      $pdf = [System.IO.Path]::ChangeExtension($file.FullName, '.pdf')
      $document.ExportAsFixedFormat($pdf, 17)
      # Word can replace its document COM proxy when a TOC refreshes during print.
      $document = $word.Documents.Item($file.Name)
      $tocText = @($document.TablesOfContents | ForEach-Object { $_.Range.Text })
      $results += [PSCustomObject]@{ file = $file.Name; pages = $document.ComputeStatistics(2); tables = $document.Tables.Count; toc = $document.TablesOfContents.Count; tocText = $tocText; pdf = [System.IO.Path]::GetFileName($pdf) }
    } catch {
      Write-Output $_.ScriptStackTrace
      throw
    } finally {
      if ($null -ne $document) {
        try { $document.Close(0) } catch { Write-Warning 'Word document cleanup failed after disconnection' }
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
      }
    }
  }
  $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $target 'word-summary.json') -Encoding utf8
  $results | Format-Table -AutoSize
} finally {
  $document = $null; $range = $null; $story = $null; $toc = $null
  try { $word.Quit() } catch { Write-Warning 'Word cleanup failed after disconnection' }
  [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
  $word = $null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
  # Some Office add-ins retain COM references after Quit. Stop only the hidden instance this script created.
  foreach ($automationWordId in $automationWordIds) {
    Wait-Process -Id $automationWordId -Timeout 2 -ErrorAction SilentlyContinue
    Get-Process -Id $automationWordId -ErrorAction SilentlyContinue | Stop-Process -ErrorAction SilentlyContinue
  }
}

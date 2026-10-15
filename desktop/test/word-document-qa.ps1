param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$target = (Resolve-Path -LiteralPath $Directory).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$results = @()
try {
  foreach ($file in Get-ChildItem -LiteralPath $target -Filter '*.docx' -File) {
    $document = $null
    try {
      $document = $word.Documents.Open($file.FullName, $false, $true, $false)
      $null = $document.Fields.Update()
      foreach ($toc in $document.TablesOfContents) { $toc.Update() }
      $document.Repaginate()
      $pdf = [System.IO.Path]::ChangeExtension($file.FullName, '.pdf')
      $document.ExportAsFixedFormat($pdf, 17)
      $results += [PSCustomObject]@{ file = $file.Name; pages = $document.ComputeStatistics(2); tables = $document.Tables.Count; toc = $document.TablesOfContents.Count; pdf = [System.IO.Path]::GetFileName($pdf) }
    } finally {
      if ($null -ne $document) { $document.Close(0); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
    }
  }
  $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $target 'word-summary.json') -Encoding utf8
  $results | Format-Table -AutoSize
} finally {
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
}

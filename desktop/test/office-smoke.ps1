$ErrorActionPreference = 'Stop'
$artifacts = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../release/qa/exports.json') -Raw -Encoding utf8 | ConvertFrom-Json
$results = @()
$word = $null
$excel = $null
$powerpoint = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $file = ($artifacts | Where-Object format -eq 'docx').path
  $doc = $word.Documents.Open($file, $false, $true)
  try {
    if ($doc.Content.Text.Length -lt 20) { throw 'DOCX_CONTENT_MISSING' }
    $doc.ExportAsFixedFormat(($file + '.pdf'), 17)
    $results += @{ format = 'docx'; application = 'Word'; opened = $true; pages = $doc.ComputeStatistics(2) }
  } finally { $doc.Close(0) }
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.AutomationSecurity = 3
  $file = ($artifacts | Where-Object format -eq 'xlsx').path
  $book = $excel.Workbooks.Open($file, 0, $true)
  try {
    if ($book.Worksheets.Item(1).UsedRange.Rows.Count -lt 2) { throw 'XLSX_CONTENT_MISSING' }
    $book.ExportAsFixedFormat(0, ($file + '.pdf'))
    $results += @{ format = 'xlsx'; application = 'Excel'; opened = $true; rows = $book.Worksheets.Item(1).UsedRange.Rows.Count }
  } finally { $book.Close($false) }
  $powerpoint = New-Object -ComObject PowerPoint.Application
  $powerpoint.AutomationSecurity = 3
  $file = ($artifacts | Where-Object format -eq 'pptx').path
  $deck = $powerpoint.Presentations.Open($file, -1, 0, 0)
  try {
    if ($deck.Slides.Count -lt 1) { throw 'PPTX_CONTENT_MISSING' }
    $deck.SaveAs(($file + '.pdf'), 32)
    $results += @{ format = 'pptx'; application = 'PowerPoint'; opened = $true; slides = $deck.Slides.Count }
  } finally { $deck.Close() }
  $results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../release/qa/office-smoke.json') -Encoding utf8
  $results | ConvertTo-Json
} finally {
  foreach ($application in @($word, $excel, $powerpoint)) {
    if ($null -ne $application) { $application.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application) }
  }
}

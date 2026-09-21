param([string]$FilePath = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'windows-runtime.ps1')
# Find only: the privacy helper never downloads a runtime or uploads the file.
$nodeBin = Find-StepNode -RootDir $rootDir
if (-not $nodeBin) {
    Write-Host 'เปิด Install-STeP-AI.bat ให้เสร็จก่อน แล้วกลับมาตรวจไฟล์ก่อนแนบ AI'
    exit 2
}
if (-not $FilePath) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'เลือกไฟล์เพื่อตรวจบนเครื่อง ก่อนแนบให้ AI'
    $dialog.Filter = 'Documents|*.pdf;*.docx;*.txt;*.md;*.csv;*.tsv;*.json;*.yaml;*.yml;*.log|All files|*.*'
    try {
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
        $FilePath = $dialog.FileName
    } finally { $dialog.Dispose() }
}
& $nodeBin (Join-Path $rootDir 'bin/step-ai.js') privacy --file $FilePath
exit $LASTEXITCODE

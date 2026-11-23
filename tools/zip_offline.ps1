# Zip the offline edition (index.html at the zip root, as itch.io / CrazyGames expect).
#   powershell -ExecutionPolicy Bypass -File tools/zip_offline.ps1
# Writes entries with forward slashes: Windows PowerShell's Compress-Archive uses
# backslashes, which web servers (itch.io, CrazyGames) treat as part of the file name.
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'dist\chrono-rift-offline'
$zip = Join-Path $root 'dist\chrono-rift-offline.zip'
if (-not (Test-Path (Join-Path $src 'index.html'))) { Write-Error 'Run node tools/build_offline.js first.'; exit 1 }
if (Test-Path $zip) { Remove-Item $zip -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$srcFull = (Resolve-Path $src).Path.TrimEnd('\') + '\'
$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($srcFull.Length).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose(); $fs.Dispose() }
$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Output "zipped: dist\chrono-rift-offline.zip ($mb MB)"

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Text.Encoding

$desktop = [Environment]::GetFolderPath("Desktop")
$gbk = [System.Text.Encoding]::GetEncoding(936)

# Find .cmd files on the desktop by pattern (avoids hardcoded garbled paths)
Get-ChildItem (Join-Path $desktop "*-Calculus-Quest-*.cmd") | ForEach-Object {
    $utf8Content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($_.FullName, $utf8Content, $gbk)
    Write-Host "OK: $($_.Name)"
}

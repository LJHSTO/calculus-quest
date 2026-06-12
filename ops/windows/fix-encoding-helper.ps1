$ErrorActionPreference = "Continue"
$gbk = [System.Text.Encoding]::GetEncoding(936)
$desktop = [Environment]::GetFolderPath("Desktop")
Get-ChildItem (Join-Path $desktop "*.cmd") | ForEach-Object {
    $utf8 = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($_.FullName, $utf8, $gbk)
    Write-Host "OK: $($_.Name)"
}

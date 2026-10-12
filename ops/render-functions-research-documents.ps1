$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$names = @(
    '函数与极限主动Agent完整设计与验收指标-2026-09-16',
    '函数与极限L0至L5完整支架设计',
    '函数与极限教师人工审核材料',
    '函数与极限被试说明与完整问卷-规范修订版'
)
$style = @'
html { color: #20252a; background: #f3f5f6; font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; letter-spacing: 0; }
body { box-sizing: border-box; max-width: 1120px; margin: 24px auto; padding: 40px 48px 64px; background: white; line-height: 1.8; font-size: 16px; }
h1 { font-size: 30px; line-height: 1.4; border-bottom: 3px solid #276c63; padding-bottom: 20px; }
h2 { font-size: 23px; margin: 40px 0 16px; padding-top: 12px; border-top: 1px solid #d7e0e2; }
h3 { font-size: 19px; margin-top: 30px; }
h4 { font-size: 17px; margin-top: 24px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 20px 0; font-size: 14px; }
th, td { text-align: left; vertical-align: top; border: 1px solid #ced8da; padding: 10px 12px; overflow-wrap: anywhere; }
th { background: #eaf2f0; color: #184e47; }
tr:nth-child(even) td { background: #fafbfc; }
p, li, blockquote { overflow-wrap: anywhere; }
a { color: #155c91; text-decoration: underline; }
pre { padding: 14px; background: #f4f6f8; border: 1px solid #dce1e6; white-space: pre-wrap; overflow-wrap: anywhere; }
code { font-family: Consolas, "Microsoft YaHei", monospace; font-size: .9em; overflow-wrap: anywhere; }
blockquote { margin: 16px 0; padding: 4px 18px; border-left: 3px solid #a4b9b5; background: #fafbfb; color: #34424b; }
details { margin: 20px 0; padding: 10px 0; border-bottom: 1px solid #d7e0e2; }
summary { color: #245c54; cursor: pointer; font-weight: 600; }
details ol { columns: 2; column-gap: 32px; padding-left: 24px; font-size: 14px; }
details li { break-inside: avoid; margin: 4px 0; }
img { max-width: 100%; height: auto; }
@media (max-width: 760px) { body { margin: 0; padding: 22px 16px; } h1 { font-size: 25px; } th, td { padding: 7px; font-size: 12px; } }
@media print { html { background: white; } body { margin: 0; padding: 0; max-width: none; font-size: 10.5pt; } h1 { font-size: 22pt; } h2 { font-size: 16pt; } table { font-size: 9pt; } h1, h2, h3, h4 { break-after: avoid; } tr, blockquote { break-inside: avoid; } a { color: inherit; } @page { size: A4; margin: 16mm; } }
'@
foreach ($name in $names) {
    $source = Join-Path $root "research/$name.md"
    $target = Join-Path $root "research/$name.html"
    $markdown = Get-Content -LiteralPath $source -Raw -Encoding utf8
    $html = (ConvertFrom-Markdown -InputObject $markdown).Html
    $document = [xml]("<main>$html</main>")
    $details = $document.CreateElement('details')
    $summary = $document.CreateElement('summary')
    $summary.InnerText = '目录'
    [void]$details.AppendChild($summary)
    $list = $document.CreateElement('ol')
    foreach ($heading in $document.SelectNodes('/main/h2')) {
        $item = $document.CreateElement('li')
        $link = $document.CreateElement('a')
        $link.SetAttribute('href', "#$($heading.id)")
        $link.InnerText = $heading.InnerText
        [void]$item.AppendChild($link)
        [void]$list.AppendChild($item)
    }
    [void]$details.AppendChild($list)
    [void]$document.DocumentElement.InsertAfter($details, $document.SelectSingleNode('/main/h1'))
    $html = $document.DocumentElement.InnerXml
    $title = [System.Net.WebUtility]::HtmlEncode(($markdown -split "`n")[0].TrimStart('#', ' ').Trim())
    $result = "<!doctype html>`n<html lang=`"zh-CN`"><head><meta charset=`"utf-8`"><meta name=`"viewport`" content=`"width=device-width,initial-scale=1`"><title>$title</title><style>$style</style></head><body>$html</body></html>"
    [System.IO.File]::WriteAllText($target, $result, [System.Text.UTF8Encoding]::new($false))
    Write-Output $target
}

param([int]$Width = 2048, [int]$Quality = 85)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$mapDir = Join-Path $PSScriptRoot "..\assets\map"
$backup = Join-Path $mapDir "flatmap__2.original.png"
$target = Join-Path $mapDir "flatmap__2.jpg"
if (-not (Test-Path $backup)) { Write-Host "Backup original not found: $backup"; exit 1 }
$src = [System.Drawing.Image]::FromFile($backup)
try {
    $nw = $Width; $nh = [int][Math]::Round($src.Height * $Width / $src.Width)
    $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $nw, $nh); $g.Dispose()
    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
    $tmp = "$target.tmp"
    $bmp.Save($tmp, $jpegCodec, $ep); $bmp.Dispose()
    Move-Item $tmp $target -Force
    Write-Host ("Done: {0}x{1} q{2} -> flatmap__2.jpg ({3:N0} KB)" -f $nw, $nh, $Quality, ((Get-Item $target).Length/1KB))
} finally { $src.Dispose() }

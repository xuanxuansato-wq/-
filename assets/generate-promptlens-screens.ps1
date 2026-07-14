Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$assetDir = Join-Path (Get-Location) 'assets'

function New-Canvas($path, $title, $subtitle) {
  $bmp = New-Object System.Drawing.Bitmap 1280, 760
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.Rectangle]::new(0,0,1280,760), [System.Drawing.Color]::FromArgb(246,252,255), [System.Drawing.Color]::FromArgb(235,247,255), 90)
  $g.FillRectangle($bg, 0, 0, 1280, 760)
  $fontTitle = New-Object System.Drawing.Font('Microsoft YaHei UI', 28, [System.Drawing.FontStyle]::Bold)
  $fontSub = New-Object System.Drawing.Font('Microsoft YaHei UI', 13, [System.Drawing.FontStyle]::Regular)
  $brushDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18,32,51))
  $brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(86,119,148))
  $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(43,146,191))), 42, 38, 8, 42)
  $g.DrawString($title, $fontTitle, $brushDark, 66, 32)
  $g.DrawString($subtitle, $fontSub, $brushMuted, 68, 86)
  return @{ Bitmap = $bmp; Graphics = $g; Path = $path }
}

function RoundRectPath($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Fill-Round($g, $x, $y, $w, $h, $r, $color) {
  $brush = New-Object System.Drawing.SolidBrush($color)
  $path = RoundRectPath $x $y $w $h $r
  $g.FillPath($brush, $path)
  $path.Dispose(); $brush.Dispose()
}

function Stroke-Round($g, $x, $y, $w, $h, $r, $color, $width = 1) {
  $pen = New-Object System.Drawing.Pen($color, $width)
  $path = RoundRectPath $x $y $w $h $r
  $g.DrawPath($pen, $path)
  $path.Dispose(); $pen.Dispose()
}

function Text($g, $txt, $x, $y, $size = 14, $color = '#122033', $style = 'Regular') {
  $fontStyle = [System.Drawing.FontStyle]::Regular
  if ($style -eq 'Bold') { $fontStyle = [System.Drawing.FontStyle]::Bold }
  $font = New-Object System.Drawing.Font('Microsoft YaHei UI', $size, $fontStyle)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($color))
  $g.DrawString($txt, $font, $brush, [single]$x, [single]$y)
  $font.Dispose(); $brush.Dispose()
}

function Pill($g, $txt, $x, $y, $w, $color = '#eef6ff', $fg = '#245f8f') {
  Fill-Round $g $x $y $w 34 16 ([System.Drawing.ColorTranslator]::FromHtml($color))
  Text $g $txt ($x + 14) ($y + 7) 12 $fg 'Bold'
}

function Save-Canvas($canvas) {
  $canvas.Bitmap.Save($canvas.Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
}

# 1. 悬浮工具条 + 右侧识别面板
$c = New-Canvas (Join-Path $assetDir 'promptlens-screenshot-toolbar.png') '工具截图 1：页面悬浮操作' '在素材页悬停视频或图片，直接唤起识别、下载和设置。'
$g = $c.Graphics
Fill-Round $g 52 130 780 560 28 ([System.Drawing.Color]::FromArgb(15,22,28))
Fill-Round $g 95 166 520 488 20 ([System.Drawing.Color]::FromArgb(27,45,56))
$videoBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.Rectangle]::new(95,166,520,488), [System.Drawing.Color]::FromArgb(66,119,132), [System.Drawing.Color]::FromArgb(10,16,20), 75)
$g.FillRectangle($videoBrush, 95, 166, 520, 488)
Text $g '素材视频预览' 265 352 24 '#ffffff' 'Bold'
Text $g '0:13 / 0:42' 132 618 14 '#e9f4ff' 'Bold'
Fill-Round $g 78 146 292 62 12 ([System.Drawing.Color]::FromArgb(25,33,38))
Pill $g '识视频' 96 160 76 '#303941' '#ffffff'
Pill $g '下载' 184 160 66 '#303941' '#ffffff'
Pill $g '设置' 262 160 66 '#303941' '#ffffff'
Fill-Round $g 860 130 366 560 24 ([System.Drawing.Color]::FromArgb(28,36,41))
Text $g '识别结果面板' 892 162 19 '#a6f0dc' 'Bold'
Pill $g '复制提示词并打开即梦' 892 204 190 '#2f3940' '#ffffff'
Pill $g '下载视频' 1094 204 96 '#2f3940' '#ffffff'
Text $g '节选识别' 892 266 15 '#a6f0dc' 'Bold'
Pill $g '5s' 892 294 72 '#313b40' '#ffffff'
Pill $g '10s' 978 294 72 '#313b40' '#ffffff'
Pill $g '15s' 1064 294 72 '#313b40' '#ffffff'
Pill $g '30s' 1150 294 72 '#313b40' '#ffffff'
Text $g '即梦中文提示词' 892 374 15 '#a6f0dc' 'Bold'
Fill-Round $g 892 404 296 168 12 ([System.Drawing.Color]::FromArgb(36,45,50))
Text $g '第一人称视角，玩家在河道中探索，' 910 424 14 '#f3fbff'
Text $g '水面反光清晰，镜头轻微晃动，' 910 454 14 '#f3fbff'
Text $g '真实 3D 游戏画面，节奏紧凑。' 910 484 14 '#f3fbff'
Save-Canvas $c

# 2. 视频分镜结构
$c = New-Canvas (Join-Path $assetDir 'promptlens-screenshot-storyboard.png') '工具截图 2：视频分镜编辑' '识别后按镜头时间、画面描述、BGM、镜头语言结构化输出。'
$g = $c.Graphics
Fill-Round $g 58 130 1164 570 28 ([System.Drawing.Color]::FromArgb(255,255,255))
Stroke-Round $g 58 130 1164 570 28 ([System.Drawing.Color]::FromArgb(205,231,246)) 2
Text $g '主体 / 场景 / 风格' 92 162 18 '#166b92' 'Bold'
Pill $g '主体：第一人称玩家 + 钓鱼设备' 92 200 270 '#eaf7ff' '#245f8f'
Pill $g '场景：河流 / 雪山 / 极光' 384 200 220 '#eaf7ff' '#245f8f'
Pill $g '风格：写实 3D 游戏' 626 200 190 '#eaf7ff' '#245f8f'
Text $g '镜头调整' 92 276 18 '#166b92' 'Bold'
$y = 316
for ($i=1; $i -le 4; $i++) {
  Fill-Round $g 92 $y 1040 72 14 ([System.Drawing.Color]::FromArgb(245,251,255))
  Stroke-Round $g 92 $y 1040 72 14 ([System.Drawing.Color]::FromArgb(213,233,245)) 1
  Text $g "镜头 $i" 116 ($y + 18) 15 '#122033' 'Bold'
  $start = ($i - 1) * 5
  $end = $i * 5
  Pill $g "${start}s-${end}s" 218 ($y + 18) 92 '#ecfbf5' '#1d6b54'
  Text $g '画面描述：关键动作与场景变化' 334 ($y + 17) 14 '#405d78'
  Text $g 'BGM：紧张 / 明亮 / 节奏推进' 628 ($y + 17) 14 '#405d78'
  Text $g '镜头语言：第一人称、推进、切换' 890 ($y + 17) 14 '#405d78'
  $y += 86
}
Fill-Round $g 1010 154 160 42 18 ([System.Drawing.Color]::FromArgb(32,126,166))
Text $g '复制分镜' 1052 164 14 '#ffffff' 'Bold'
Save-Canvas $c

# 3. 图片提示词编辑 + 预览
$c = New-Canvas (Join-Path $assetDir 'promptlens-screenshot-image-prompt.png') '工具截图 3：图片反推与生图预览' '图片可查看缩略图、编辑提示词、选择比例并调用多 API 预览。'
$g = $c.Graphics
Fill-Round $g 70 130 500 560 26 ([System.Drawing.Color]::FromArgb(20,28,32))
$imgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.Rectangle]::new(110,188,420,420), [System.Drawing.Color]::FromArgb(154,211,244), [System.Drawing.Color]::FromArgb(235,246,255), 90)
Fill-Round $g 110 188 420 420 22 ([System.Drawing.Color]::FromArgb(225,245,255))
$g.FillRectangle($imgBrush, 110, 188, 420, 420)
Text $g '图片缩略图' 245 376 24 '#246b8f' 'Bold'
Pill $g '下载图片' 402 150 98 '#2f3940' '#ffffff'
Pill $g '关闭' 512 150 68 '#2f3940' '#ffffff'
Fill-Round $g 620 130 590 560 26 ([System.Drawing.Color]::FromArgb(255,255,255))
Stroke-Round $g 620 130 590 560 26 ([System.Drawing.Color]::FromArgb(205,231,246)) 2
Text $g '中文提示词编辑' 656 166 19 '#166b92' 'Bold'
Fill-Round $g 656 208 510 150 14 ([System.Drawing.Color]::FromArgb(246,251,255))
Text $g '真实 3D 游戏风格，第一人称视角，玩家在高空雪地' 676 232 14 '#122033'
Text $g '场景中攀爬，天空明亮，画面清爽，动作紧张。' 676 264 14 '#122033'
Text $g '画面比例' 656 390 15 '#166b92' 'Bold'
Pill $g '9:16' 656 420 70 '#ecfbf5' '#1d6b54'
Pill $g '16:9' 742 420 72 '#eef6ff' '#245f8f'
Pill $g '3:4' 830 420 64 '#eef6ff' '#245f8f'
Pill $g '4:3' 910 420 64 '#eef6ff' '#245f8f'
Fill-Round $g 656 506 170 46 18 ([System.Drawing.Color]::FromArgb(32,126,166))
Text $g '生成预览' 708 518 15 '#ffffff' 'Bold'
Fill-Round $g 844 506 116 46 18 ([System.Drawing.Color]::FromArgb(48,57,65))
Text $g '复制' 884 518 15 '#ffffff' 'Bold'
Fill-Round $g 978 506 136 46 18 ([System.Drawing.Color]::FromArgb(48,57,65))
Text $g '下载预览' 1008 518 15 '#ffffff' 'Bold'
Save-Canvas $c

# 4. 设置页
$c = New-Canvas (Join-Path $assetDir 'promptlens-screenshot-settings.png') '工具截图 4：多 API 设置' '识别模型与生图预览模型分开配置，便于额度不足时切换。'
$g = $c.Graphics
Fill-Round $g 110 130 1060 560 28 ([System.Drawing.Color]::FromArgb(255,255,255))
Stroke-Round $g 110 130 1060 560 28 ([System.Drawing.Color]::FromArgb(205,231,246)) 2
Text $g '识别 API 设置' 154 170 20 '#166b92' 'Bold'
Text $g '用于识图、识视频、关键帧分镜分析' 154 204 14 '#5d7895'
Text $g '生图预览 API 设置' 674 170 20 '#166b92' 'Bold'
Text $g '用于根据提示词快速生成预览图' 674 204 14 '#5d7895'
$providers = @('Gemini', 'GPT / OpenAI', '豆包 / 火山方舟', '即梦 / Seedream')
$y = 252
foreach ($p in $providers) {
  Fill-Round $g 154 $y 420 58 14 ([System.Drawing.Color]::FromArgb(246,251,255))
  Stroke-Round $g 154 $y 420 58 14 ([System.Drawing.Color]::FromArgb(213,233,245)) 1
  Text $g $p 178 ($y + 17) 15 '#122033' 'Bold'
  $y += 74
}
$y = 252
foreach ($p in $providers) {
  Fill-Round $g 674 $y 420 58 14 ([System.Drawing.Color]::FromArgb(246,251,255))
  Stroke-Round $g 674 $y 420 58 14 ([System.Drawing.Color]::FromArgb(213,233,245)) 1
  Text $g $p 698 ($y + 17) 15 '#122033' 'Bold'
  $y += 74
}
Fill-Round $g 454 612 180 46 18 ([System.Drawing.Color]::FromArgb(32,126,166))
Text $g '保存设置' 510 624 15 '#ffffff' 'Bold'
Fill-Round $g 654 612 180 46 18 ([System.Drawing.Color]::FromArgb(48,57,65))
Text $g '测试连接' 710 624 15 '#ffffff' 'Bold'
Save-Canvas $c

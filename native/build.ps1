# Recompila os helpers nativos (usa o compilador C# que já vem no Windows)
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
Set-Location $PSScriptRoot
& $csc /nologo /target:exe /platform:x64 /out:audiohelper.exe audiohelper.cs
& $csc /nologo /target:exe /platform:x64 /out:hidprobe.exe hidprobe.cs
& $csc /nologo /target:exe /platform:x64 /out:procscan.exe procscan.cs
$fx = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'; $wm = 'C:\Windows\System32\WinMetadata'
& $csc /nologo /target:exe /platform:x64 /out:mediactl.exe "/r:$fx\System.Runtime.dll" "/r:$wm\Windows.Foundation.winmd" "/r:$wm\Windows.Media.winmd" "/r:$wm\Windows.Storage.winmd" mediactl.cs

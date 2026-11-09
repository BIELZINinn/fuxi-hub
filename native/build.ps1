# Recompila os helpers nativos (usa o compilador C# que já vem no Windows)
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
Set-Location $PSScriptRoot
& $csc /nologo /target:exe /platform:x64 /out:audiohelper.exe audiohelper.cs
& $csc /nologo /target:exe /platform:x64 /out:hidprobe.exe hidprobe.cs
& $csc /nologo /target:exe /platform:x64 /out:procscan.exe procscan.cs

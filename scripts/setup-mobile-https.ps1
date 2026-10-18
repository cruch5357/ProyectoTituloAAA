param([string[]]$Addresses = @())
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$certificateDir = Join-Path $projectRoot '.certs'
$toolDir = Join-Path $certificateDir 'tools'
New-Item -ItemType Directory -Force $toolDir | Out-Null
$mkcertPath = Join-Path $toolDir 'mkcert.exe'
if (-not (Test-Path -LiteralPath $mkcertPath)) {
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
    Invoke-WebRequest -Uri "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-$architecture.exe" -OutFile $mkcertPath
}
if ($Addresses.Count -eq 0) {
    $Addresses = @(node -e "const os=require('os');for(const items of Object.values(os.networkInterfaces()))for(const i of items)if(i.family==='IPv4'&&!i.internal)console.log(i.address)")
}
if ($Addresses.Count -eq 0) { throw 'No se encontro una direccion de red local.' }
$previousCaRoot = $env:CAROOT
try {
    # CA exclusiva del proyecto. No modifica el almacen de confianza de Windows.
    $env:CAROOT = Join-Path $certificateDir 'ca'
    & $mkcertPath -key-file (Join-Path $certificateDir 'local-key.pem') -cert-file (Join-Path $certificateDir 'local.pem') localhost 127.0.0.1 ::1 @Addresses
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el certificado.' }
    $publicCa = Join-Path $env:CAROOT 'rootCA.pem'
    $downloadCa = Join-Path $certificateDir 'local-ca.cer'
    node -e "const fs=require('fs'),{X509Certificate}=require('crypto');fs.writeFileSync(process.argv[2],new X509Certificate(fs.readFileSync(process.argv[1])).raw)" $publicCa $downloadCa
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo exportar el certificado publico.' }
} finally {
    if ($null -eq $previousCaRoot) { Remove-Item Env:CAROOT -ErrorAction SilentlyContinue }
    else { $env:CAROOT = $previousCaRoot }
}
Write-Host 'Certificado listo. En Safari descarga e instala el perfil desde una de estas direcciones:'
foreach ($address in $Addresses) { Write-Host "http://${address}:5173/local-ca.cer" }
Write-Host 'Activa su confianza en Ajustes > General > Informacion > Ajustes de confianza de certificados.'
Write-Host 'Luego ejecuta npm run pwa:mobile y agrega la URL HTTPS de puerto 4173 al inicio.'

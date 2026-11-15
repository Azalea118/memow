param([ValidateSet('Prepare','Start','Status','Stop')][string]$Stage = 'Status')
$ErrorActionPreference = 'Stop'
$Compose = Join-Path $PSScriptRoot 'compose.yaml'
$Repo = Split-Path $PSScriptRoot -Parent
function Run-Docker([string[]]$Arguments) {
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker command failed. Stop here and share its output.' }
}
function Check-FreeSpace([double]$MinimumGB) {
    # Check the Windows system drive (usual Docker Desktop disk location) and project drive.
    $Roots = @([IO.Path]::GetPathRoot($Repo), [IO.Path]::GetPathRoot($env:SystemRoot)) | Select-Object -Unique
    foreach ($Root in $Roots) {
        $Drive = New-Object System.IO.DriveInfo($Root)
        $FreeGB = $Drive.AvailableFreeSpace / 1GB
        Write-Host ('{0} free space: {1:N1} GB' -f $Root, $FreeGB)
        if ($FreeGB -lt $MinimumGB) {
            throw "Less than $MinimumGB GB remains. Free ordinary files or move Docker storage; do not delete project databases or Docker volumes."
        }
    }
}
if ($Stage -eq 'Stop') {
    Run-Docker -Arguments @('compose','-f',$Compose,'stop','photo-places','nominatim')
    exit
}
if ($Stage -eq 'Status') {
    Run-Docker -Arguments @('compose','-f',$Compose,'ps','-a')
    Run-Docker -Arguments @('compose','-f',$Compose,'logs','--tail','15','photo-places')
    exit
}
if (-not (Test-Path (Join-Path $Repo 'data\app2\photos.db'))) {
    throw 'Existing data\app2\photos.db was not found. Do not continue with a different database path.'
}
if ($Stage -eq 'Prepare') {
    Check-FreeSpace 15
    $Bytes = & docker info --format '{{.MemTotal}}'
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop first.' }
    if ([double]$Bytes -lt 6GB) { throw 'Docker needs at least 6 GB available for this configuration alongside Northpoint.' }
    New-Item -ItemType Directory -Force (Join-Path $Repo 'data\geocoding\maps') | Out-Null
    Run-Docker -Arguments @('compose','-f',$Compose,'--profile','tools','run','--rm','--build','prepare-map')
    Check-FreeSpace 10
    Write-Host 'Map preparation finished. Next run this script with -Stage Start.'
    exit
}
Check-FreeSpace 10
$Pbf = Join-Path $Repo 'data\geocoding\maps\cdo-bukidnon.osm.pbf'
if (-not (Test-Path $Pbf)) { throw 'Run -Stage Prepare first.' }
Run-Docker -Arguments @('compose','-f',$Compose,'up','-d','nominatim')
Write-Host 'Importing map. This can take a while. Leave this window open for the disk-space guard.'
$Ready = $false
$Deadline = (Get-Date).AddHours(2)
while ((Get-Date) -lt $Deadline) {
    try { Check-FreeSpace 5 }
    catch {
        & docker compose -f $Compose stop nominatim
        throw
    }
    try {
        $Status = Invoke-RestMethod -Uri 'http://127.0.0.1:8088/status?format=json' -TimeoutSec 5
        if ($null -ne $Status.status -and $Status.status -eq 0) { $Ready = $true; break }
    } catch { }
    $Id = & docker compose -f $Compose ps -a -q nominatim
    if ($Id) {
        $State = & docker inspect --format '{{.State.Status}}' $Id
        if ($State -eq 'exited' -or $State -eq 'dead') {
            & docker compose -f $Compose logs --tail 30 nominatim
            throw 'Map import stopped. Share these logs; do not remove its volume.'
        }
    }
    Start-Sleep -Seconds 15
}
if (-not $Ready) {
    & docker compose -f $Compose stop nominatim
    throw 'Import did not become ready within two hours. It was stopped to keep disk use supervised. Share the geocoder logs.'
}
$Backup = '/data/photos-before-geocoding-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.db.bak'
Run-Docker -Arguments @('compose','-f',$Compose,'run','--rm','photo-places','python','/opt/worker.py','--backup',$Backup)
Run-Docker -Arguments @('compose','-f',$Compose,'up','-d','photo-places')
Write-Host 'Place lookup started. Existing and new photos will be processed automatically. Refresh Photos in the HR dashboard after a minute.'

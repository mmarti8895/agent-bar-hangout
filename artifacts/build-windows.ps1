#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build Agent Bar Hangout desktop app for Windows.

.DESCRIPTION
    Builds the Tauri desktop application and copies the installer/executable
    to artifacts/builds/. Requires Node.js, npm, and Rust/Cargo installed.

.EXAMPLE
    .\artifacts\build-windows.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BuildsDir = Join-Path $PSScriptRoot "builds"

Write-Host "=== Agent Bar Hangout — Windows Build ===" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot"

# Verify prerequisites
Write-Host "`n[1/5] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Install from https://nodejs.org/"
}
$nodeVersion = node --version
Write-Host "  Node.js: $nodeVersion"

if (-not (Get-Command "cargo" -ErrorAction SilentlyContinue)) {
    # Try refreshing PATH from system (common after fresh Rust install)
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    if (-not (Get-Command "cargo" -ErrorAction SilentlyContinue)) {
        Write-Error "Rust/Cargo not found. Install from https://rustup.rs/"
    }
}
$cargoVersion = cargo --version
Write-Host "  Cargo: $cargoVersion"

# Install npm dependencies
Write-Host "`n[2/5] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $RepoRoot
try {
    npm install --prefer-offline 2>&1 | Out-Null
    Write-Host "  npm install complete."
} finally {
    Pop-Location
}

# Build with Tauri
Write-Host "`n[3/5] Building Tauri application..." -ForegroundColor Yellow
Push-Location $RepoRoot
try {
    npm run tauri:build 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { Write-Error "Tauri build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

# Copy artifacts
Write-Host "`n[4/5] Copying build artifacts..." -ForegroundColor Yellow
if (-not (Test-Path $BuildsDir)) { New-Item -ItemType Directory -Path $BuildsDir -Force | Out-Null }

$BundleDir = Join-Path $RepoRoot "src-tauri\target\release\bundle"

# NSIS installer (MSI dropped — WiX Warning 1946 with AppUserModel.ID)
$NsisFiles = Get-ChildItem -Path (Join-Path $BundleDir "nsis") -Filter "*.exe" -ErrorAction SilentlyContinue
foreach ($f in $NsisFiles) {
    Copy-Item $f.FullName -Destination $BuildsDir -Force
    Write-Host "  Copied: $($f.Name)"
}

# Summary
Write-Host "`n[5/5] Build complete!" -ForegroundColor Green
$outputs = Get-ChildItem -Path $BuildsDir -File -ErrorAction SilentlyContinue
if ($outputs) {
    Write-Host "`nBuild artifacts in $BuildsDir :"
    foreach ($o in $outputs) {
        if ($o.Name -eq ".gitkeep") { continue }
        $sizeMB = [math]::Round($o.Length / 1MB, 2)
        Write-Host "  $($o.Name)  ($sizeMB MB)"
    }
} else {
    Write-Warning "No build artifacts found. Check the Tauri build output above for errors."
}

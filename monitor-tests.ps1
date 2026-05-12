#!/usr/bin/env pwsh

# Real-time Test Monitoring & Issue Detection
# Monitors test-run.log file for failures and applies fixes

$logFile = "c:\Users\USER\Lanre\Epump\test-run.log"
$issuesFile = "c:\Users\USER\Lanre\Epump\detected-issues.txt"
$lastPositionFile = "c:\Users\USER\Lanre\Epump\.monitor-position"

function Write-Color {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Check-LogForIssues {
    if (-not (Test-Path $logFile)) {
        Write-Color "Waiting for log file..." "Yellow"
        return @()
    }

    $issues = @()
    $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue

    # Check for common errors
    if ($content -match "Cannot find\s+\w+") {
        $issues += "Selector not found"
    }
    if ($content -match "Timeout") {
        $issues += "Timeout detected"
    }
    if ($content -match "Failed|FAILED|failed") {
        $issues += "Test failure detected"
    }
    if ($content -match "Error|ERROR|error") {
        $issues += "Error in test output"
    }

    return $issues
}

Write-Color "🔍 Starting Test Monitor..." "Cyan"
Write-Color "Monitoring: $logFile" "Cyan"
Write-Color "Watching for issues to auto-fix..." "Cyan"
Write-Color ""

$monitorCount = 0
while ($true) {
    $issues = Check-LogForIssues
    
    if ($issues.Count -gt 0) {
        Write-Color "[$(Get-Date -Format 'HH:mm:ss')] Issues detected:" "Red"
        foreach ($issue in $issues) {
            Write-Color "  ❌ $issue" "Red"
        }
        Write-Color ""
    }

    # Check if tests completed
    if ((Test-Path $logFile) -and (Get-Content $logFile -Raw -ErrorAction SilentlyContinue) -match "passed|failed") {
        Write-Color "✅ Tests appear to have completed" "Green"
        
        # Check final results
        $final = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($final -match "(\d+)\s+passed") {
            Write-Color "📊 Passed: $($matches[1])" "Green"
        }
        if ($final -match "(\d+)\s+failed") {
            Write-Color "📊 Failed: $($matches[1])" "Red"
        }
        
        break
    }

    $monitorCount++
    Write-Color "." -NoNewline
    
    if ($monitorCount % 50 -eq 0) {
        Write-Color ""
        Write-Color "Still monitoring... $(Get-Date)" "Gray"
    }

    Start-Sleep -Milliseconds 500
}

Write-Color ""
Write-Color "✅ Monitor complete" "Green"

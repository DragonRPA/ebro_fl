# agent/trayIcon.ps1
# eBro AI Agent Windows System Tray Icon Worker
param(
    [int]$AgentPid = 0,
    [int]$Port = 5175,
    [string]$AgentVersion = "v2.0.0"
)

# 🚀 Windows EcoQoS(효율 모드) 절전 스로틀링 원천 차단: 트레이 및 에이전트 프로세스 우선순위 AboveNormal 격상
try {
    [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = [System.Diagnostics.ProcessPriorityClass]::AboveNormal
    if ($AgentPid -gt 0) {
        $agentProc = Get-Process -Id $AgentPid -ErrorAction SilentlyContinue
        if ($agentProc) {
            $agentProc.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::AboveNormal
        }
    }
} catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 🪟 Windows Win32 API Window Manager (최소화 시 작업표시줄에서 숨기고 트레이로 수납)
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class StudioWindowManager {
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static IntPtr FindStudioWindow(bool visibleOnly = false) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (visibleOnly && !IsWindowVisible(hWnd)) return true;
            StringBuilder sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString();
            if (title.Contains("eBro AI Agent") || title.Contains("eBro Agent")) {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@

# 단일 인스턴스 보장 (Mutex 자가 복구)
$createdNew = $false
try {
    $mutex = [System.Threading.Mutex]::new($true, "Local\eBroAgentTrayMutex", [ref]$createdNew)
    if (-not $createdNew) {
        exit
    }
} catch {}

# 🌐 테넌트 정책 및 버전 상태 파일 경로
$policyPath = "C:\eBroAgent\tenant_policy.json"
$statusPath = "C:\eBroAgent\agent_status.json"
$script:aiEnabled = $false
$script:currentVer = if ($AgentVersion) { $AgentVersion } else { "v2.0.0" }
$script:targetVer = $script:currentVer
$script:isMismatch = $false
$script:updateStatus = "idle"

if (Test-Path -LiteralPath $policyPath) {
    try {
        $policyJson = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
        if ($null -ne $policyJson.agentAiEnabled) {
            $script:aiEnabled = [bool]$policyJson.agentAiEnabled
        }
    } catch {}
}

$notify = New-Object System.Windows.Forms.NotifyIcon

# 브랜드 아이콘 로드 (eBroAgent.ico 우선)
$icoCandidates = @(
    "C:\eBroAgent\eBroAgent.ico",
    (Join-Path $PSScriptRoot "eBroAgent.ico")
)
$loadedIco = $false
foreach ($ic in $icoCandidates) {
    if (Test-Path -LiteralPath $ic) {
        try {
            $notify.Icon = New-Object System.Drawing.Icon($ic)
            $loadedIco = $true
            break
        } catch {}
    }
}
if (-not $loadedIco) {
    $notify.Icon = [System.Drawing.SystemIcons]::Application
}

# Windows Forms NotifyIcon.Text 63자 제한 안전 설정 헬퍼
function Set-SafeTrayTooltip([string]$rawText) {
    if (-not $rawText) { return }
    $safe = $rawText
    if ($safe.Length -gt 63) {
        $safe = $safe.Substring(0, 63)
    }
    try {
        if ($notify.Text -ne $safe) {
            $notify.Text = $safe
        }
    } catch {}
}

function Get-ShortBuildTag([string]$verStr) {
    if (-not $verStr) { return "" }
    if ($verStr -match "Build\.(\d+)") {
        return "Build." + $Matches[1]
    }
    return $verStr
}

$script:lastPolicyMtime = [DateTime]::MinValue
$script:lastStatusMtime = [DateTime]::MinValue

function Sync-AgentVersionStatus([bool]$force = $false) {
    if (Test-Path -LiteralPath $statusPath) {
        try {
            $mtime = [System.IO.File]::GetLastWriteTimeUtc($statusPath)
            if ($force -or $mtime -ne $script:lastStatusMtime) {
                $script:lastStatusMtime = $mtime
                $st = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($st.currentVersion) { $script:currentVer = [string]$st.currentVersion }
                if ($st.targetVersion) { $script:targetVer = [string]$st.targetVersion } else { $script:targetVer = $script:currentVer }
                if ($null -ne $st.isMismatch) { $script:isMismatch = [bool]$st.isMismatch }
                if ($st.status) { $script:updateStatus = [string]$st.status }
            } else {
                return
            }
        } catch {}
    }

    $tarShort = Get-ShortBuildTag $script:targetVer
    if ($script:updateStatus -eq "downloading" -or $script:updateStatus -eq "installing") {
        Set-SafeTrayTooltip "🔄업데이트중: $($script:currentVer) -> $tarShort"
    } elseif ($script:isMismatch) {
        Set-SafeTrayTooltip "⚠️버전불일치! 현재:$($script:currentVer) / 최신:$tarShort"
    } else {
        if ($script:aiEnabled) {
            Set-SafeTrayTooltip "eBro AI 에이전트 $($script:currentVer) (최신·정상)"
        } else {
            Set-SafeTrayTooltip "eBro 에이전트 $($script:currentVer) (최신·정상)"
        }
    }

    if ($null -ne $script:mVerInfo) {
        if ($script:isMismatch) {
            $script:mVerInfo.Text = "⚠️ 버전 불일치: 현재 $($script:currentVer) / 최신 $($script:targetVer)"
        } else {
            $script:mVerInfo.Text = "버전 정보: $($script:currentVer) (최신 버전 일치)"
        }
    }
}

Sync-AgentVersionStatus $true
$notify.Visible = $true

# 📌 Windows 11 작업표시줄 숨김 트레이(^) 자동 수납 방지: 시계 옆 항상 표시(IsPromoted=1) 자동 등록
function Ensure-TrayIconPromoted {
    $promotedAny = $false
    try {
        $regBase = "HKCU:\Control Panel\NotifyIconSettings"
        if (Test-Path -LiteralPath $regBase) {
            Get-ChildItem -LiteralPath $regBase -ErrorAction SilentlyContinue | ForEach-Object {
                try {
                    $prop = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
                    if ($prop -and ($prop.InitialTooltip -like "*eBro*" -or $prop.ExecutablePath -like "*powershell.exe*" -or $prop.ExecutablePath -like "*eBroAgent*")) {
                        if ($prop.IsPromoted -ne 1) {
                            Set-ItemProperty -LiteralPath $_.PSPath -Name "IsPromoted" -Value 1 -Type DWord -ErrorAction SilentlyContinue
                            $promotedAny = $true
                        }
                    }
                } catch {}
            }
        }
    } catch {}
    return $promotedAny
}
Ensure-TrayIconPromoted | Out-Null

function Open-Studio {
    $studioHwnd = [StudioWindowManager]::FindStudioWindow($false)
    if ($studioHwnd -ne [IntPtr]::Zero) {
        # 창이 이미 존재하면 (트레이로 숨겨져 있거나 최소화되어 있어도) 즉시 복원 및 화면 최상단 활성화
        [StudioWindowManager]::ShowWindow($studioHwnd, 9) | Out-Null # SW_RESTORE = 9
        [StudioWindowManager]::SetForegroundWindow($studioHwnd) | Out-Null
        return
    }

    $url = "http://127.0.0.1:$Port/studio"
    $candidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
    )
    $browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($browser) {
        Start-Process $browser -ArgumentList ("--app=" + $url), "--window-size=1100,800"
    } else {
        Start-Process $url
    }
}

function Open-Archive {
    $tCode = "GIYEONLIFT"
    if (Test-Path -LiteralPath $policyPath) {
        try {
            $pJson = Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($pJson.tenantCode) {
                $rawCode = ([string]$pJson.tenantCode).Trim().ToUpper() -replace '[^A-Z0-9_-]', ''
                if ($rawCode -in @("GIYEONLIFT", "GIYEUN", "GIYUEN", "KIYUEN", "GIYEON")) {
                    $tCode = "GIYEONLIFT"
                } elseif ($rawCode) {
                    $tCode = $rawCode
                }
            }
        } catch {}
    }
    $dir = Join-Path "C:\eBroAgent\문서고" $tCode
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Start-Process "explorer.exe" $dir
}

$notify.add_DoubleClick({
    if ($script:aiEnabled) {
        Open-Studio
    } else {
        Open-Archive
    }
})

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$script:mVerInfo = $menu.Items.Add("버전 정보: $($script:currentVer) (최신 버전 일치)")
$script:mVerInfo.Font = New-Object System.Drawing.Font($menu.Font, [System.Drawing.FontStyle]::Bold)
$script:mVerInfo.add_Click({
    try {
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/check-update" -TimeoutSec 3 | Out-Null
        Sync-AgentVersionStatus $true
    } catch {}
})

$mCheckUpdate = $menu.Items.Add("최신 버전 확인 및 즉시 업데이트")
$mCheckUpdate.add_Click({
    try {
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/check-update" -TimeoutSec 3 | Out-Null
        Sync-AgentVersionStatus $true
    } catch {}
})

$menu.Items.Add("-") | Out-Null

$mStudio = $menu.Items.Add("eBro AI 스튜디오 열기")
$mStudio.Font = New-Object System.Drawing.Font($menu.Font, [System.Drawing.FontStyle]::Bold)
$mStudio.Visible = $script:aiEnabled
$mStudio.add_Click({ Open-Studio })

# 🌐 테넌트 전용 ERP 로그인 페이지 URL 산출
function Get-TenantLoginUrl {
    $pPath = "C:\eBroAgent\tenant_policy.json"
    $tCode = "GIYEONLIFT"
    $subdomain = ""
    if (Test-Path -LiteralPath $pPath) {
        try {
            $pJson = Get-Content -LiteralPath $pPath -Raw | ConvertFrom-Json
            if ($pJson.subdomain) {
                $subdomain = [string]$pJson.subdomain
            }
            if ($pJson.tenantCode) {
                $tCode = [string]$pJson.tenantCode
            }
        } catch {}
    }

    if ($subdomain) {
        $cleanSub = $subdomain.Trim().ToLower()
        if ($cleanSub -eq "giyeonlift" -or $cleanSub -eq "giyeun" -or $cleanSub -eq "giyuen" -or $cleanSub -eq "kiyuen") {
            return "https://giyeon.ebro.run"
        }
        return "https://$cleanSub.ebro.run"
    }

    $cleanCode = $tCode.Trim().ToUpper()
    if ($cleanCode -eq "GIYEONLIFT" -or $cleanCode -eq "GIYEUN" -or $cleanCode -eq "GIYUEN" -or $cleanCode -eq "KIYUEN") {
        return "https://giyeon.ebro.run"
    } elseif ($cleanCode -and $cleanCode -ne "EBRO") {
        $sub = $cleanCode.ToLower()
        return "https://$sub.ebro.run"
    }
    return "https://ebro.run?mode=tenant"
}

$mErp = $menu.Items.Add("e-Bro ERP 사이트 열기")
$mErp.add_Click({ 
    $targetUrl = Get-TenantLoginUrl
    Start-Process $targetUrl 
})

$mFolder = $menu.Items.Add("로컬 문서고 열기")
$mFolder.add_Click({ Open-Archive })

$menu.Items.Add("-") | Out-Null

$appContext = New-Object System.Windows.Forms.ApplicationContext

$script:userRequestedExit = $false
$script:lastRestartTick = [DateTime]::MinValue
$script:policyCheckTick = 0
$script:promoteTick = 0

$mExit = $menu.Items.Add("에이전트 종료")
$mExit.add_Click({
    $script:userRequestedExit = $true
    $notify.Visible = $false
    $notify.Dispose()
    Get-Process -Name eBroAgent -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $appContext.ExitThread()
})

$notify.ContextMenuStrip = $menu
Sync-AgentVersionStatus $true

# 백그라운드 데몬 기동 및 핫패치 시 윈도우 풍선 알림(ShowBalloonTip)으로 업무 화면을 방해하지 않음 (무소음 트레이 상주)
$script:hasShownTip = $true

# 750ms 주기 모니터링 타이머: 에이전트 무중단 Watchdog 자가 복구 & mtime 기반 정책/버전 감지 & 스튜디오 창 최소화 시 트레이 수납
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 750
$timer.add_Tick({
    if ($script:userRequestedExit) { return }

    # 0. 테넌트 정책 및 버전 상태는 파일 mtime 변경 시에만 파싱 (~2.25초 주기)
    $script:policyCheckTick++
    if ($script:policyCheckTick -ge 3) {
        $script:policyCheckTick = 0
        if (Test-Path -LiteralPath $policyPath) {
            try {
                $pMtime = [System.IO.File]::GetLastWriteTimeUtc($policyPath)
                if ($pMtime -ne $script:lastPolicyMtime) {
                    $script:lastPolicyMtime = $pMtime
                    $pJson = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
                    if ($null -ne $pJson.agentAiEnabled) {
                        $newAi = [bool]$pJson.agentAiEnabled
                        if ($newAi -ne $script:aiEnabled) {
                            $script:aiEnabled = $newAi
                            $mStudio.Visible = $script:aiEnabled
                        }
                    }
                }
            } catch {}
        }
        Sync-AgentVersionStatus $false
    }

    # 0-1. Windows 11 트레이 고정(IsPromoted=1) 보장 (~60초 주기)
    $script:promoteTick++
    if ($script:promoteTick -ge 80) {
        $script:promoteTick = 0
        Ensure-TrayIconPromoted | Out-Null
    }

    # 1. 부모 Agent 프로세스 감시 및 무중단 Watchdog 자동 복구
    $runningAgents = Get-Process -Name eBroAgent -ErrorAction SilentlyContinue
    if (-not $runningAgents) {
        $now = [DateTime]::Now
        if (($now - $script:lastRestartTick).TotalSeconds -ge 4) {
            $script:lastRestartTick = $now
            $exePath = "C:\eBroAgent\eBroAgent.exe"
            if (Test-Path -LiteralPath $exePath) {
                try {
                    Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "`"$exePath`" --daemon" | Out-Null
                } catch {
                    Start-Process -FilePath $exePath -ArgumentList "--daemon" -WindowStyle Hidden
                }
            }
        }
        return
    }

    # 2. 스튜디오 창 감시: 보이는 창만 대상으로 최소화(_) 클릭 시 작업표시줄에서 숨김 (SW_HIDE)
    $studioHwnd = [StudioWindowManager]::FindStudioWindow($true)
    if ($studioHwnd -ne [IntPtr]::Zero) {
        if ([StudioWindowManager]::IsIconic($studioHwnd)) {
            # SW_HIDE = 0 : 작업표시줄 버튼 및 창을 화면에서 완전히 숨김!
            [StudioWindowManager]::ShowWindow($studioHwnd, 0) | Out-Null
            
            if (-not $script:hasShownTip) {
                $script:hasShownTip = $true
                $notify.BalloonTipTitle = "eBro AI Agent"
                $notify.BalloonTipText = "스튜디오 창이 시스템 트레이로 최소화되었습니다. 트레이 아이콘을 더블클릭하면 언제든 다시 열립니다."
                $notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
                $notify.ShowBalloonTip(2000)
            }
        }
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run($appContext)

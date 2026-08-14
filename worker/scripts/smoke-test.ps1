# End-to-end smoke test against the deployed TrainRight API.
#
# Runs the full Phase A1 acceptance path - pair a device, push a record, pull it
# back, tombstone it, revoke the device - and prints only PASS/FAIL lines. The
# bootstrap code is never echoed or written down.
#
# Preferred: set the secret and test it in ONE session, so no copy-paste can go
# wrong and the value tested is provably the value stored:
#
#   cd "c:\Users\ACER\Claude Cowork\Health app\worker"
#   $code = node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
#   $code | npx wrangler secret put BOOTSTRAP_CODE
#   Set-Clipboard -Value $code        # then save it to your password manager
#   .\scripts\smoke-test.ps1 -Code $code
#
# Or run it standalone and paste at the hidden prompt:
#
#   powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
#
# THIS FILE MUST STAY PURE ASCII, and must contain no backtick line
# continuations. Windows PowerShell 5.1 reads a UTF-8 file with no BOM as
# Windows-1252, which turns an em dash into a sequence containing a double
# quote and terminates strings early; and the repo rewrites LF to CRLF, which
# breaks backtick continuations.

param([string]$Code)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$api = "https://trainright-api.lifestyleapp.workers.dev"
$pass = 0
$fail = 0

function Check($name, $condition, $detail) {
    if ($condition) {
        Write-Host "  PASS  $name" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  FAIL  $name  ($detail)" -ForegroundColor Red
        $script:fail++
    }
}

if ($Code) {
    $code = $Code
} else {
    $secure = Read-Host "Bootstrap code" -AsSecureString
    $code = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
$code = $code.Trim()

Write-Host ""
Write-Host "Testing $api" -ForegroundColor Cyan
Write-Host ""

# 1. Pair a device
$json = @{ "Content-Type" = "application/json" }
$bootBody = @{ code = $code; label = "Smoke test"; scope = "app" } | ConvertTo-Json

# A secret change publishes a new Worker version; rollout takes a few seconds,
# so retry rather than failing on a timing race.
$boot = $null
$lastStatus = 0
for ($attempt = 1; $attempt -le 6; $attempt++) {
    try {
        $boot = Invoke-RestMethod -Uri "$api/v1/auth/bootstrap" -Method Post -Headers $json -Body $bootBody
        break
    } catch {
        $lastStatus = 0
        if ($_.Exception.Response) { $lastStatus = $_.Exception.Response.StatusCode.value__ }
        if ($lastStatus -eq 401) { break }
        Write-Host "  ..  attempt $attempt got HTTP $lastStatus, retrying in 10s" -ForegroundColor DarkGray
        Start-Sleep -Seconds 10
    }
}

if (-not $boot) {
    if ($lastStatus -eq 401) {
        Write-Host "  FAIL  bootstrap rejected (401): the code does not match the stored secret." -ForegroundColor Red
        Write-Host "        Fix by setting and testing in one session, with no copy-paste:"
        Write-Host '          $code = node -e "console.log(require(''crypto'').randomBytes(24).toString(''base64url''))"'
        Write-Host '          $code | npx wrangler secret put BOOTSTRAP_CODE'
        Write-Host '          Set-Clipboard -Value $code'
        Write-Host '          .\scripts\smoke-test.ps1 -Code $code'
    } elseif ($lastStatus -eq 503) {
        Write-Host "  FAIL  bootstrap says not_configured (503): no usable secret is set." -ForegroundColor Red
    } else {
        Write-Host "  FAIL  bootstrap unreachable (HTTP $lastStatus)." -ForegroundColor Red
    }
    exit 1
}

Check "bootstrap issues a token" ($boot.token.Length -ge 40) "token length $($boot.token.Length)"
Remove-Variable code

$auth = @{ Authorization = "Bearer $($boot.token)"; "Content-Type" = "application/json" }

# 2. Push a record
$id = [guid]::NewGuid().ToString()
$fields = @{ name = "Smoke test"; date = "2026-08-14" }
$mutation = @{ domain = "achievement"; id = $id; updatedAt = "2026-08-14T12:00:00.000Z"; deleted = $false; fields = $fields }
$body = @{ mutations = @($mutation) } | ConvertTo-Json -Depth 8

$push = Invoke-RestMethod -Uri "$api/v1/sync/push" -Method Post -Headers $auth -Body $body
Check "push applies the record" ($push.results[0].status -eq "applied") $push.results[0].status
Check "server assigns a revision" ($push.revision -gt 0) "revision $($push.revision)"

# 3. Replay must be idempotent
$replay = Invoke-RestMethod -Uri "$api/v1/sync/push" -Method Post -Headers $auth -Body $body
Check "replaying the same mutation is a no-op" ($replay.results[0].status -eq "stale") $replay.results[0].status

# 4. Pull it back
$pull = Invoke-RestMethod -Uri "$api/v1/sync/pull?since=0" -Method Get -Headers $auth
$found = $pull.changes | Where-Object { $_.id -eq $id }
Check "pull returns the record" ($null -ne $found) "not found among $($pull.changes.Count) changes"
Check "field values survive the round trip" ($found.fields.name -eq "Smoke test") "got '$($found.fields.name)'"
Check "record is not marked deleted" ($found.deleted -eq $false) "deleted=$($found.deleted)"

# 5. Cursor semantics
$empty = Invoke-RestMethod -Uri "$api/v1/sync/pull?since=$($pull.revision)" -Method Get -Headers $auth
Check "a current cursor returns nothing" ($empty.changes.Count -eq 0) "$($empty.changes.Count) changes"

# 6. Tombstone it, which also leaves production clean
$delMutation = @{ domain = "achievement"; id = $id; updatedAt = "2026-08-14T12:30:00.000Z"; deleted = $true; fields = @{} }
$delBody = @{ mutations = @($delMutation) } | ConvertTo-Json -Depth 8
$null = Invoke-RestMethod -Uri "$api/v1/sync/push" -Method Post -Headers $auth -Body $delBody

$after = Invoke-RestMethod -Uri "$api/v1/sync/pull?since=$($pull.revision)" -Method Get -Headers $auth
$tomb = $after.changes | Where-Object { $_.id -eq $id }
Check "deletion propagates as a tombstone" ($tomb.deleted -eq $true) "deleted=$($tomb.deleted)"

# 7. Revoke this device
$null = Invoke-RestMethod -Uri "$api/v1/devices/$($boot.deviceId)" -Method Delete -Headers $auth
try {
    $null = Invoke-RestMethod -Uri "$api/v1/devices" -Method Get -Headers $auth
    Check "revoked device is rejected" $false "request still succeeded"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Check "revoked device is rejected" ($status -eq 401) "got HTTP $status"
}

Write-Host ""
if ($fail -eq 0) {
    Write-Host "ALL $pass CHECKS PASSED - Phase A1 verified end to end." -ForegroundColor Green
} else {
    Write-Host "$pass passed, $fail FAILED." -ForegroundColor Red
}
Write-Host ""

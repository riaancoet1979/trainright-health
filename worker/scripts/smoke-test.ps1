# End-to-end smoke test against the deployed TrainRight API.
#
# Runs the full Phase A1 acceptance path — pair a device, push a record, pull it
# back, tombstone it, revoke the device — and prints only PASS/FAIL lines. The
# bootstrap code is read from a hidden prompt and never echoed or written down.
#
#   cd "c:\Users\ACER\Claude Cowork\Health app\worker"
#   powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1

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

$secure = Read-Host "Bootstrap code" -AsSecureString
$code = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

Write-Host ""
Write-Host "Testing $api" -ForegroundColor Cyan
Write-Host ""

# ── 1. Pair a device ─────────────────────────────────────────────────────────
$json = @{ "Content-Type" = "application/json" }
try {
    $boot = Invoke-RestMethod -Uri "$api/v1/auth/bootstrap" -Method Post -Headers $json `
        -Body (@{ code = $code; label = "Smoke test"; scope = "app" } | ConvertTo-Json)
    Check "bootstrap issues a token" ($boot.token.Length -ge 40) "token length $($boot.token.Length)"
} catch {
    Write-Host "  FAIL  bootstrap rejected — is the code correct?" -ForegroundColor Red
    Write-Host "        $($_.Exception.Message)"
    exit 1
}
Remove-Variable code

$auth = @{ Authorization = "Bearer $($boot.token)"; "Content-Type" = "application/json" }

# ── 2. Push a record ─────────────────────────────────────────────────────────
$id = [guid]::NewGuid().ToString()
$body = @{ mutations = @(@{
    domain = "achievement"; id = $id; updatedAt = "2026-08-14T12:00:00.000Z"
    deleted = $false; fields = @{ name = "Smoke test"; date = "2026-08-14" }
}) } | ConvertTo-Json -Depth 8

$push = Invoke-RestMethod -Uri "$api/v1/sync/push" -Method Post -Headers $auth -Body $body
Check "push applies the record" ($push.results[0].status -eq "applied") $push.results[0].status
Check "server assigns a revision" ($push.revision -gt 0) "revision $($push.revision)"

# ── 3. Replay must be idempotent ─────────────────────────────────────────────
$replay = Invoke-RestMethod -Uri "$api/v1/sync/push" -Method Post -Headers $auth -Body $body
Check "replaying the same mutation is a no-op" ($replay.results[0].status -eq "stale") $replay.results[0].status

# ── 4. Pull it back ──────────────────────────────────────────────────────────
$pull = Invoke-RestMethod -Uri "$api/v1/sync/pull?since=0" -Method Get -Headers $auth
$found = $pull.changes | Where-Object { $_.id -eq $id }
Check "pull returns the record" ($null -ne $found) "not found in $($pull.changes.Count) changes"
Check "field values survive the round trip" ($found.fields.name -eq "Smoke test") "got '$($found.fields.name)'"
Check "record is not marked deleted" ($found.deleted -eq $false) "deleted=$($found.deleted)"

# ── 5. Cursor semantics ──────────────────────────────────────────────────────
$empty = Invoke-RestMethod -Uri "$api/v1/sync/pull?since=$($pull.revision)" -Method Get -Headers $auth
Check "a current cursor returns nothing" ($empty.changes.Count -eq 0) "$($empty.changes.Count) changes"

# ── 6. Tombstone it (leaves production clean) ────────────────────────────────
$del = @{ mutations = @(@{
    domain = "achievement"; id = $id; updatedAt = "2026-08-14T12:30:00.000Z"
    deleted = $true; fields = @{}
}) } | ConvertTo-Json -Depth 8
$null = Invoke-RestMethod -Uri "$api/v1/sync/push" -Method Post -Headers $auth -Body $del

$after = Invoke-RestMethod -Uri "$api/v1/sync/pull?since=$($pull.revision)" -Method Get -Headers $auth
$tomb = $after.changes | Where-Object { $_.id -eq $id }
Check "deletion propagates as a tombstone" ($tomb.deleted -eq $true) "deleted=$($tomb.deleted)"

# ── 7. Revoke this device ────────────────────────────────────────────────────
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

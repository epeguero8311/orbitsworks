Write-Host "===== Checking firebase.json for firestore.indexes wiring ====="
if (Test-Path .\firebase.json) {
  Get-Content .\firebase.json
} else {
  Write-Host "firebase.json NOT FOUND - stop and let me know before deploying indexes." -ForegroundColor Red
}

Write-Host ""
Write-Host "===== Writing firestore.indexes.json ====="
$indexesJson = @"
{
  "indexes": [
    {
      "collectionGroup": "clockEvents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "employeeId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "clockEvents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "siteId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "clockEvents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "employeeId", "order": "ASCENDING" },
        { "fieldPath": "siteId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
"@
$indexesJson | Set-Content -Path .\firestore.indexes.json -Encoding ascii -NoNewline
Write-Host "OK: firestore.indexes.json written" -ForegroundColor Green

Write-Host ""
Write-Host "===== Patching time/page.tsx error message ====="
$path = ".\app\dashboard\time\page.tsx"
$raw = Get-Content $path -Raw
$content = $raw -replace "`r`n", "`n"

$old = @"
    } catch (err) {
      console.error("Clock event lookup error:", err);
      setLookupError(
        "Search failed. If this keeps happening, check the browser console - Firestore may need a composite index (it will log a link to create one)."
      );
    } finally {
      setLookupLoading(false);
    }
  }
  function clearLookup() {
"@
$new = @"
    } catch (err) {
      const isIndexError =
        err instanceof Error `&`& (err as { code?: string }).code === "failed-precondition";
      console.error(
        isIndexError
          ? "Clock event lookup error: missing Firestore composite index. Check firestore.indexes.json and run ``firebase deploy --only firestore:indexes``."
          : "Clock event lookup error:",
        err
      );
      setLookupError(
        "We couldn't complete that search. Try narrowing your filters, or contact support if this keeps happening."
      );
    } finally {
      setLookupLoading(false);
    }
  }
  function clearLookup() {
"@

if ($content.IndexOf($old) -eq -1) {
  Write-Host "FAILED: could not find lookup catch block" -ForegroundColor Red
} else {
  $content = $content.Replace($old, $new)
  $content = $content -replace "`n", "`r`n"
  $content | Set-Content -Path $path -Encoding ascii -NoNewline
  Write-Host "OK: error message patched" -ForegroundColor Green
}

Write-Host ""
Write-Host "===== Verification ====="
Select-String -Path .\app\dashboard\time\page.tsx -Pattern "couldn't complete that search|isIndexError"
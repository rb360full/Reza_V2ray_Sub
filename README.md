# Reza_V2ray_Sub

A production-grade, self-hosted V2Ray subscription aggregator with integrated validation pipeline. Runs entirely through GitHub Actions and GitHub Pages / Raw GitHub URLs. No VPS, cloud server, database, external API service, proxy service, subscription converter, or continuously running local computer required.

## Project Purpose

This repository collects local subscription files and remote V2Ray subscription URLs, merges them into a single deduplicated subscription file, validates all configurations through a staged pipeline, and generates health reports. Updates run automatically every 12 hours using GitHub Actions free tier resources.

## Folder Structure

```
Reza_V2ray_Sub/
├── configs/                          # Local subscription files
│   └── example.txt                   # Sample configuration
├── output/                           # Generated output files
│   ├── merged.txt                    # All merged configurations
│   ├── merged_checked.txt            # Only healthy configurations
│   ├── report.json                   # Merge statistics
│   ├── health-report.json            # Validation stage breakdown
│   └── bad_configs.txt               # Failed configurations with reasons
├── scripts/                          # Merge and validation scripts
│   ├── merge.js                      # Main orchestration script
│   └── validation.js                 # Staged validation pipeline
├── .github/workflows/                # GitHub Actions workflows
│   └── merge-subscriptions.yml       # Automated workflow
├── Sub Links.txt                     # Remote subscription URLs
├── merged.txt                        # Merged configurations (root)
├── merged_checked.txt                # Healthy configurations (root)
├── package.json                      # Node.js dependencies
└── README.md                         # This file
```

## Installation

### Local Setup

1. Clone the repository:

```bash
git clone https://github.com/<your-username>/Reza_V2ray_Sub.git
cd Reza_V2ray_Sub
```

2. Install dependencies:

```bash
npm install
```

3. Test locally:

```bash
npm run merge
```

### GitHub Setup

1. Create a new public repository named `Reza_V2ray_Sub` on GitHub.
2. Push all files from this project to the repository.
3. GitHub Actions will be automatically enabled (no additional configuration required).
4. The workflow will execute every 12 hours at **00:00 UTC** and **12:00 UTC**.

## How Subscriptions Are Merged

### Merge Process

1. **Load Local Configurations**: Read all `.txt` files from `./configs`.
2. **Load Remote Subscriptions**: Download each URL listed in `./Sub Links.txt`.
3. **Normalize Lines**: Trim whitespace and remove empty/comment lines.
4. **Remove Duplicates**: Keep only unique configurations (preserving order).
5. **Generate `merged.txt`**: Write all deduplicated configurations.

### Validation Pipeline

A **5-stage validation pipeline** processes merged configurations:

#### Stage 1: Syntax Validation
- Checks for valid V2Ray protocol prefixes (`vmess://`, `vless://`, `ss://`, `ssr://`, `trojan://`, etc.)
- Verifies minimum configuration length
- **Optimization**: Fails fast for obviously invalid configs

#### Stage 2: Decode Validation
- Attempts to decode base64 payloads in JSON-based protocols
- Validates JSON structure for `vmess://` and `vless://` configurations
- **Optimization**: Only processes configs that passed Stage 1

#### Stage 3: Required Fields Validation
- Extracts and validates required fields (`add`, `port`, etc.)
- Ensures mandatory fields are present and non-empty
- **Optimization**: Only processes configs that passed Stage 2

#### Stage 4: DNS Validation
- Performs DNS resolution for hostnames
- Skips IP addresses (IPv4/IPv6) automatically
- **Optimization**: Uses concurrency pool (default: 50 parallel requests)
- **Optimization**: Only processes configs that passed Stage 3

#### Stage 5: TCP Validation
- Establishes TCP connections to validate server availability
- Timeout: 2000ms (configurable)
- **Optimization**: Uses concurrency pool (default: 50 parallel requests)
- **Optimization**: ONLY runs on configs that passed ALL previous stages

### Why This Approach Optimizes for GitHub Actions Free Tier

```
Example: 3000 configurations

Stage 1 → 2800 pass (200 fail)
Stage 2 → 2600 pass (200 fail)
Stage 3 → 2400 pass (200 fail)
Stage 4 → 2100 pass (300 fail)
Stage 5 → 1900 pass (200 fail)  ← TCP only validates 2100, not all 3000
```

**Key Benefits:**

- **Network Efficiency**: TCP validation runs on ~64% of configs (DNS passed)
- **CPU Efficiency**: Early failures prevent unnecessary processing
- **Time Efficiency**: Parallel processing with limited concurrency (50 workers)
- **Resource Stability**: No spike in connections or resource usage

## GitHub Actions Workflow

### Schedule

The workflow runs automatically on a **12-hour schedule** at:
- **00:00 UTC** (Midnight)
- **12:00 UTC** (Noon)

Cron expression: `0 0,12 * * *`

### Manual Execution

Trigger the workflow manually from the GitHub Actions tab using `workflow_dispatch`.

### Workflow Steps

1. **Checkout**: Clone repository with full history
2. **Setup Node.js**: Install Node.js 18
3. **Install Dependencies**: Install `p-queue` for concurrency management
4. **Run Merge & Validation**: Execute `npm run merge`
5. **Check Changes**: Display git status
6. **Commit & Push**: Auto-commit if changes detected

### Environment Variables

Configured in `.github/workflows/merge-subscriptions.yml`:

```yaml
TCP_TIMEOUT_MS: 2000       # TCP connection timeout
DNS_RETRIES: 1             # DNS retry attempts
TCP_RETRIES: 1             # TCP retry attempts
VALIDATION_CONCURRENCY: 50 # Max parallel validations
```

Override during workflow dispatch or in the workflow file.

## How to Add Local Configs

1. Create a `.txt` file in the `configs/` folder:

```bash
touch configs/my_subscriptions.txt
```

2. Add one configuration per line:

```text
vmess://base64-encoded-configuration-1
vmess://base64-encoded-configuration-2
vless://base64-encoded-configuration-3
```

3. Commit and push:

```bash
git add configs/my_subscriptions.txt
git commit -m "Add new subscription file"
git push
```

The workflow will automatically pick up new files on the next scheduled run.

## How to Add Remote Subscriptions

1. Edit `Sub Links.txt`:

```bash
nano Sub Links.txt
```

2. Add one remote subscription URL per line:

```text
https://raw.githubusercontent.com/username/repo/main/subscription.txt
https://example.com/v2ray/subscriptions.txt
https://anothercdn.com/v2ray/list.txt
```

3. Commit and push:

```bash
git add "Sub Links.txt"
git commit -m "Add new remote subscription URLs"
git push
```

The workflow will download and merge these URLs on the next run.

## How to Use the Final Subscription URL in v2rayNG / v2rayN

### Get the Raw GitHub URL

The raw URL for your merged subscription is:

```text
https://raw.githubusercontent.com/<your-github-username>/Reza_V2ray_Sub/main/merged.txt
```

For **healthy/validated configurations only**, use:

```text
https://raw.githubusercontent.com/<your-github-username>/Reza_V2ray_Sub/main/merged_checked.txt
```

Replace `<your-github-username>` with your actual GitHub username.

### Import in v2rayNG

1. Open v2rayNG
2. Go to **Subscriptions**
3. Click **Add Subscription**
4. Paste your raw GitHub URL
5. Save and refresh

### Import in v2rayN

1. Open v2rayN
2. Go to **Subscriptions**
3. Click **Add**
4. Paste your raw GitHub URL
5. Click **Update** to refresh

## Output Files

### `merged.txt`
All deduplicated configurations from local files + remote URLs.

### `merged_checked.txt`
Only healthy configurations that passed all 5 validation stages.

### `output/report.json`
Merge statistics:

```json
{
  "localFilesCount": 5,
  "remoteUrlsCount": 3,
  "totalImportedLines": 1500,
  "uniqueLines": 1200,
  "duplicateLinesRemoved": 300,
  "executionTimeMs": 45000,
  "generatedAt": "2026-06-09T12:00:00.000Z"
}
```

### `output/health-report.json`
Validation stage breakdown:

```json
{
  "validationStages": {
    "stage1_syntax": { "name": "Syntax Validation", "passed": 1200 },
    "stage2_decode": { "name": "Decode Validation", "passed": 1180 },
    "stage3_required_fields": { "name": "Required Fields", "passed": 1150 },
    "stage4_dns": { "name": "DNS Validation", "passed": 1050 },
    "stage5_tcp": { "name": "TCP Validation", "passed": 950 }
  },
  "summary": {
    "totalConfigurations": 1200,
    "healthyConfigurations": 950,
    "healthRate": "79.17%",
    "failedSyntax": 0,
    "failedDecode": 20,
    "failedRequiredFields": 30,
    "failedDNS": 100,
    "failedTCP": 100
  },
  "executionTimeMs": 120000,
  "generatedAt": "2026-06-09T12:00:00.000Z"
}
```

### `output/bad_configs.txt`
Failed configurations with failure reasons:

```text
vmess://bad-config-1 # Invalid protocol prefix
vmess://bad-config-2 # Failed to decode base64 payload
vmess://bad-config-3 # Missing required field: add
```

## Troubleshooting

### Workflow Not Running

1. Ensure GitHub Actions is enabled for the repository.
2. Check the **Actions** tab for workflow status.
3. Verify the default branch is `main`.

### No Changes Committed

If the workflow ran but no changes were committed:
- No new configurations were added
- Or remote subscription URLs returned empty results
- Or no configurations passed validation

Check `output/bad_configs.txt` for validation failures.

### DNS/TCP Validation Failures

Common causes:
- Server is offline or unreachable
- Firewall blocking connections from GitHub Actions runners
- Invalid hostname in configuration
- Wrong port number

Check `output/health-report.json` for failure breakdown.

### Performance Issues

If the workflow exceeds time limits (GitHub Actions free tier: 6 hours/month per workflow):

1. Reduce `VALIDATION_CONCURRENCY` to 25-30
2. Increase `TCP_TIMEOUT_MS` to 3000 or 5000
3. Remove problematic remote URLs from `Sub Links.txt`
4. Split configurations into multiple files

### Manual Testing

Run locally to debug:

```bash
npm run merge
```

Check output files in `output/` and root directories.

## Environment Variables

Override defaults by setting environment variables before running `npm run merge`:

```bash
# Bash
export TCP_TIMEOUT_MS=3000
export VALIDATION_CONCURRENCY=30
npm run merge

# PowerShell
$env:TCP_TIMEOUT_MS = 3000
$env:VALIDATION_CONCURRENCY = 30
npm run merge
```

## GitHub Actions Free Tier Considerations

### Why 12-Hour Schedule?

- **2 runs/day** = **60 runs/month**
- **Estimated 2 minutes per run** = **120 minutes/month**
- **Free tier includes 2000 minutes/month** ✅

### Resource Usage Per Run

| Stage | Time | Network | CPU |
|-------|------|---------|-----|
| Merge | ~5s | ~100KB | Low |
| Stage 1-3 | ~10s | None | Low |
| Stage 4 (DNS) | ~20s | ~50KB | Low |
| Stage 5 (TCP) | ~30s | ~100KB | Medium |
| **Total** | **~60s** | **~250KB** | **Medium** |

### Concurrency Limits

- Default: 50 parallel DNS/TCP validations
- Prevents overwhelming GitHub Actions runner
- Total network footprint stays under limits

### Why This is Sustainable

1. **Low Frequency**: 2 runs/day vs. every hour
2. **Efficient Validation**: Only TCP-validates ~64% of configs
3. **Bounded Concurrency**: Max 50 parallel connections
4. **Minimal Storage**: Text files only (no databases)
5. **No Dependencies**: Uses built-in Node.js + single npm package

## Advanced Configuration

### Change Schedule

Edit `.github/workflows/merge-subscriptions.yml`:

```yaml
on:
  schedule:
    - cron: '0 6,18 * * *'  # 06:00 and 18:00 UTC
  workflow_dispatch: {}
```

### Adjust Concurrency

In `.github/workflows/merge-subscriptions.yml`:

```yaml
env:
  VALIDATION_CONCURRENCY: 25  # Lower for slower networks
```

### Add Custom Validation

Extend `scripts/validation.js` with additional stages:

```javascript
async function customValidation(config) {
  // Your validation logic
  return { valid: true, reason: 'Custom check OK' };
}
```

## Estimated Execution Times

For different configuration counts (DNS + TCP validation):

### 1000 Configurations
- DNS resolution: ~15s
- TCP validation: ~20s
- **Total**: ~40 seconds

### 2000 Configurations
- DNS resolution: ~25s
- TCP validation: ~35s
- **Total**: ~65 seconds

### 3000 Configurations
- DNS resolution: ~35s
- TCP validation: ~50s
- **Total**: ~90 seconds

*Times assume 50 concurrent connections and 2000ms TCP timeout.*

## Notes

- The workflow uses the built-in `GITHUB_TOKEN` (no Personal Access Tokens needed)
- The repository should be **public** for raw subscription URLs to work
- Configurations are validated but not modified
- Failed configurations are logged and never added to `merged_checked.txt`

## License

MIT

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review workflow logs in the **Actions** tab
3. Examine `output/health-report.json` for detailed failure information

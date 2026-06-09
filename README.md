# Reza_V2ray_Sub

A self-hosted V2Ray subscription aggregator that runs entirely through GitHub Actions and GitHub Pages / Raw GitHub URLs. No VPS, cloud server, database, external API service, proxy service, subscription converter, or continuously running local computer is required.

## Project Purpose

This repository collects local subscription files and remote V2Ray subscription URLs, merges them into a single deduplicated subscription file, and updates the repository automatically on a schedule using GitHub Actions.

## Folder Structure

- `configs/` - Local `.txt` subscription files. Each file is parsed line by line.
- `output/` - Generated output files and statistics.
- `scripts/` - Merge script implementation.
- `.github/workflows/` - GitHub Actions workflow configuration.
- `Sub Links.txt` - Remote subscription URLs list.
- `merged.txt` - Final merged subscription file generated in the repository root.
- `package.json` - Node.js project configuration.
- `README.md` - Project documentation.

## Installation

1. Clone the repository into a public GitHub repository named `Reza_V2ray_Sub`.
2. Install dependencies locally if you want to run the script before pushing:

```bash
npm install
```

## How Subscriptions Are Merged

1. The script reads all local `*.txt` files from `./configs`.
2. It reads remote URLs from `./Sub Links.txt`, one URL per line.
3. It downloads each remote subscription via native `fetch`.
4. It splits the entire input by lines.
5. It removes empty lines, duplicate lines, and leading/trailing spaces.
6. It writes the merged subscription to both `merged.txt` and `output/merged.txt`.
7. It saves detailed statistics to `output/report.json`.

## How GitHub Actions Works

The workflow is configured in `.github/workflows/merge-subscriptions.yml`.

- Runs every 30 minutes using cron: `*/30 * * * *`.
- Supports manual execution via `workflow_dispatch`.
- Checks out the repository and installs Node.js.
- Executes `npm run merge`.
- Commits and pushes changes automatically using the built-in `GITHUB_TOKEN`.

## How to Add Local Configs

1. Create or update files in the `configs/` folder.
2. Use `.txt` file extension.
3. Add one subscription entry per line.
4. Example file: `configs/example.txt`.

Local example:

```text
vmess://example-encoded-subscription
vmess://another-subscription
```

## How to Add Remote Subscriptions

1. Open `Sub Links.txt`.
2. Add one remote subscription URL per line.
3. Remove comments or blank lines from the final list.

Example:

```text
https://raw.githubusercontent.com/username/repo/main/remote-subscription.txt
https://example.com/v2ray/subscription.txt
```

## How to Use the Final Subscription URL in v2rayNG / v2rayN

1. Locate your repository raw file URL.
2. The raw URL is typically:

```text
https://raw.githubusercontent.com/<your-github-username>/Reza_V2ray_Sub/main/merged.txt
```

3. In v2rayNG:
   - Open `Subscriptions`.
   - Add a new subscription.
   - Use the raw GitHub URL above.
   - Refresh the subscription list.

4. In v2rayN:
   - Open `Subscription`.
   - Add a new URL.
   - Paste the `merged.txt` raw URL.
   - Update or refresh.

## Troubleshooting

- If the workflow does not run, make sure GitHub Actions is enabled for the repository.
- If `Sub Links.txt` is missing, remote subscriptions will not be loaded.
- If `configs/` is missing or empty, local subscriptions will not be loaded.
- If `merged.txt` is not updated, check the workflow logs in GitHub Actions.
- If the push fails, confirm `permissions: contents: write` is set and `GITHUB_TOKEN` is not disabled.

## Manual Execution

Run locally with:

```bash
npm run merge
```

Files created by the script:

- `merged.txt`
- `output/merged.txt`
- `output/report.json`

## Notes

- The workflow does not use a GitHub Personal Access Token.
- It uses the built-in GitHub Actions `GITHUB_TOKEN` to commit and push updates.
- The repository should be public so the raw subscription file can be used by v2rayNG and v2rayN.

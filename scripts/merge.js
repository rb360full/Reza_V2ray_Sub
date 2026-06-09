const fs = require('fs/promises');
const path = require('path');
const { validateConfigurations } = require('./validation');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'configs');
const SUB_LINKS_PATH = path.join(ROOT_DIR, 'Sub Links.txt');
const SUB_LINKS2_PATH = path.join(ROOT_DIR, 'Sub Links2.txt');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const MERGED_ROOT_PATH = path.join(ROOT_DIR, 'merged.txt');
const MERGED_OUTPUT_PATH = path.join(OUTPUT_DIR, 'merged.txt');
const MERGED_CHECKED_ROOT_PATH = path.join(ROOT_DIR, 'merged_checked.txt');
const MERGED_CHECKED_OUTPUT_PATH = path.join(OUTPUT_DIR, 'merged_checked.txt');
const MERGED2_ROOT_PATH = path.join(ROOT_DIR, 'merged2.txt');
const MERGED2_OUTPUT_PATH = path.join(OUTPUT_DIR, 'merged2.txt');
const MERGED_CHECKED2_ROOT_PATH = path.join(ROOT_DIR, 'merged_checked2.txt');
const MERGED_CHECKED2_OUTPUT_PATH = path.join(OUTPUT_DIR, 'merged_checked2.txt');
const REPORT_PATH = path.join(OUTPUT_DIR, 'report.json');
const HEALTH_REPORT_PATH = path.join(OUTPUT_DIR, 'health-report.json');
const BAD_CONFIGS_PATH = path.join(OUTPUT_DIR, 'bad_configs.txt');

// Runtime diagnostics and environment checks
try {
  console.log('Runtime diagnostics:');
  console.log('  Node version:', process.version);
  console.log('  Working dir:', process.cwd());
  console.log('  ENV VARS: TCP_TIMEOUT_MS=', process.env.TCP_TIMEOUT_MS, 'VALIDATION_CONCURRENCY=', process.env.VALIDATION_CONCURRENCY);
  const { execSync } = require('child_process');
  try {
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    console.log('  Git branch:', gitBranch);
  } catch (e) {
    console.log('  Git branch: (unable to determine)');
  }
} catch (diagError) {
  console.warn('Runtime diagnostics failed:', diagError && diagError.message);
}

// Ensure fetch is available (Node 18+). If not, try to polyfill with node-fetch for runner compatibility.
if (typeof fetch !== 'function') {
  try {
    // eslint-disable-next-line global-require
    const nodeFetch = require('node-fetch');
    global.fetch = nodeFetch;
    console.log('Polyfilled global.fetch using node-fetch');
  } catch (e) {
    console.warn('fetch is not available and node-fetch could not be loaded:', e.message);
  }
}
/**
 * Read all local .txt files from the configs folder and return every line.
 */
async function loadLocalConfigs() {
  try {
    const dirEntries = await fs.readdir(CONFIG_DIR, { withFileTypes: true });
    const txtFiles = dirEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
      .map((entry) => entry.name)
      .sort();

    const lines = [];

    for (const fileName of txtFiles) {
      const filePath = path.join(CONFIG_DIR, fileName);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const fileLines = fileContent.split(/\r?\n/);
      console.log(`Loaded local config: ${fileName} (${fileLines.length} lines)`);
      lines.push(...fileLines);
    }

    return {
      localFilesCount: txtFiles.length,
      lines,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('Warning: configs directory not found. No local subscriptions loaded.');
      return { localFilesCount: 0, lines: [] };
    }

    throw error;
  }
}

/**
 * Download every remote subscription URL listed in Sub Links.txt.
 */
async function loadRemoteSubscriptions() {
  try {
    const rawContent = await fs.readFile(SUB_LINKS_PATH, 'utf8');
    const urls = rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    console.log(`Found ${urls.length} remote subscription URL(s) in Sub Links.txt.`);

    const fetchResults = await Promise.allSettled(
      urls.map(async (url) => {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (GitHub Actions) V2Ray Subscription Aggregator',
            },
            redirect: 'follow',
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
          }

          const content = await response.text();
          const remoteLines = content.split(/\r?\n/);
          console.log(`Downloaded ${remoteLines.length} lines from: ${url}`);
          return remoteLines;
        } catch (fetchError) {
          console.error(`Failed to download ${url}: ${fetchError.message}`);
          return [];
        }
      })
    );

    const lines = fetchResults.reduce((acc, result) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        acc.push(...result.value);
      }
      return acc;
    }, []);

    return {
      remoteUrlsCount: urls.length,
      lines,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('Warning: Sub Links.txt not found. No remote subscriptions loaded.');
      return { remoteUrlsCount: 0, lines: [] };
    }

    throw error;
  }
}

/**
 * Load remote subscriptions from a specific Sub Links file path.
 */
async function loadRemoteSubscriptionsFrom(filePath, label) {
  try {
    const rawContent = await fs.readFile(filePath, 'utf8');
    const urls = rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    console.log(`Found ${urls.length} remote subscription URL(s) in ${label || filePath}.`);

    const fetchResults = await Promise.allSettled(
      urls.map(async (url) => {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (GitHub Actions) V2Ray Subscription Aggregator',
            },
            redirect: 'follow',
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
          }

          const content = await response.text();
          const remoteLines = content.split(/\r?\n/);
          console.log(`Downloaded ${remoteLines.length} lines from: ${url}`);
          return remoteLines;
        } catch (fetchError) {
          console.error(`Failed to download ${url}: ${fetchError.message}`);
          return [];
        }
      })
    );

    const lines = fetchResults.reduce((acc, result) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        acc.push(...result.value);
      }
      return acc;
    }, []);

    return {
      remoteUrlsCount: urls.length,
      lines,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Warning: ${filePath} not found. No remote subscriptions loaded from ${label || filePath}.`);
      return { remoteUrlsCount: 0, lines: [] };
    }

    throw error;
  }
}

/**
 * Normalize lines by trimming whitespace and removing empty or comment lines.
 */
function normalizeLines(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * Remove duplicate lines while preserving original order.
 */
function removeDuplicates(lines) {
  const seen = new Set();
  const uniqueLines = [];
  let duplicateLinesRemoved = 0;

  for (const line of lines) {
    if (seen.has(line)) {
      duplicateLinesRemoved += 1;
      continue;
    }

    seen.add(line);
    uniqueLines.push(line);
  }

  return { uniqueLines, duplicateLinesRemoved };
}

/**
 * Build the report object containing statistics for the run.
 */
function generateStatistics({ localFilesCount, remoteUrlsCount, importedLines, uniqueLinesCount, duplicateLinesRemoved, durationMs }) {
  return {
    localFilesCount,
    remoteUrlsCount,
    totalImportedLines: importedLines,
    uniqueLines: uniqueLinesCount,
    duplicateLinesRemoved,
    executionTimeMs: durationMs,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build the health report object with validation stage statistics.
 */
function generateHealthReport({ stats, totalHealthy, durationMs }) {
  return {
    validationStages: {
      stage1_syntax: {
        name: 'Syntax Validation',
        passed: stats.stage1_syntax,
      },
      stage2_decode: {
        name: 'Decode Validation',
        passed: stats.stage2_decode,
      },
      stage3_required_fields: {
        name: 'Required Fields Validation',
        passed: stats.stage3_required_fields,
      },
      stage4_dns: {
        name: 'DNS Validation',
        passed: stats.stage4_dns,
      },
      stage5_tcp: {
        name: 'TCP Validation',
        passed: stats.stage5_tcp,
      },
    },
    summary: {
      totalConfigurations: stats.total,
      healthyConfigurations: totalHealthy,
      failedSyntax: stats.total - stats.stage1_syntax,
      failedDecode: stats.stage1_syntax - stats.stage2_decode,
      failedRequiredFields: stats.stage2_decode - stats.stage3_required_fields,
      failedDNS: stats.stage3_required_fields - stats.stage4_dns,
      failedTCP: stats.stage4_dns - stats.stage5_tcp,
      healthRate: ((totalHealthy / stats.total) * 100).toFixed(2) + '%',
    },
    executionTimeMs: durationMs,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Save merged output files to the repository root and output folder.
 */
async function saveOutputs(lines, healthyLines, badConfigs, statistics, healthReport) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const mergedContent = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  const healthyContent = healthyLines.join('\n') + (healthyLines.length > 0 ? '\n' : '');
  const badConfigsContent = badConfigs
    .map((item) => `${item.line} # ${item.reason}`)
    .join('\n') + (badConfigs.length > 0 ? '\n' : '');

  await Promise.all([
    fs.writeFile(MERGED_ROOT_PATH, mergedContent, 'utf8'),
    fs.writeFile(MERGED_OUTPUT_PATH, mergedContent, 'utf8'),
    fs.writeFile(MERGED_CHECKED_ROOT_PATH, healthyContent, 'utf8'),
    fs.writeFile(MERGED_CHECKED_OUTPUT_PATH, healthyContent, 'utf8'),
    fs.writeFile(REPORT_PATH, JSON.stringify(statistics, null, 2) + '\n', 'utf8'),
    fs.writeFile(HEALTH_REPORT_PATH, JSON.stringify(healthReport, null, 2) + '\n', 'utf8'),
    fs.writeFile(BAD_CONFIGS_PATH, badConfigsContent, 'utf8'),
  ]);

  console.log(`Saved merged subscription to: ${MERGED_ROOT_PATH}`);
  console.log(`Saved merged subscription to: ${MERGED_OUTPUT_PATH}`);
  console.log(`Saved healthy configurations to: ${MERGED_CHECKED_ROOT_PATH}`);
  console.log(`Saved healthy configurations to: ${MERGED_CHECKED_OUTPUT_PATH}`);
  console.log(`Saved statistics report to: ${REPORT_PATH}`);
  console.log(`Saved health report to: ${HEALTH_REPORT_PATH}`);
  console.log(`Saved bad configurations to: ${BAD_CONFIGS_PATH}`);
}

/**
 * Save outputs to alternate file names (used for merged2/merged_checked2)
 */
async function saveOutputsVariant(lines, mergedRootPath, mergedOutputPath, checkedRootPath, checkedOutputPath, healthyLines, badConfigs, badConfigsPath) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const mergedContent = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  const healthyContent = healthyLines.join('\n') + (healthyLines.length > 0 ? '\n' : '');
  const badConfigsContent = badConfigs
    .map((item) => `${item.line} # ${item.reason}`)
    .join('\n') + (badConfigs.length > 0 ? '\n' : '');

  await Promise.all([
    fs.writeFile(mergedRootPath, mergedContent, 'utf8'),
    fs.writeFile(mergedOutputPath, mergedContent, 'utf8'),
    fs.writeFile(checkedRootPath, healthyContent, 'utf8'),
    fs.writeFile(checkedOutputPath, healthyContent, 'utf8'),
    fs.writeFile(badConfigsPath, badConfigsContent, 'utf8'),
  ]);

  console.log(`Saved merged subscription to: ${mergedRootPath}`);
  console.log(`Saved merged subscription to: ${mergedOutputPath}`);
  console.log(`Saved healthy configurations to: ${checkedRootPath}`);
  console.log(`Saved healthy configurations to: ${checkedOutputPath}`);
}

/**
 * Main workflow: load, normalize, deduplicate, validate, save, and report.
 */
async function run() {
  const startTime = Date.now();

  console.log('Starting V2Ray subscription merge and validation process...\n');

  const local = await loadLocalConfigs();
  const remote = await loadRemoteSubscriptions();
  const importedLines = local.lines.length + remote.lines.length;

  const normalized = normalizeLines([...local.lines, ...remote.lines]);
  const { uniqueLines, duplicateLinesRemoved } = removeDuplicates(normalized);

  const statistics = generateStatistics({
    localFilesCount: local.localFilesCount,
    remoteUrlsCount: remote.remoteUrlsCount,
    importedLines,
    uniqueLinesCount: uniqueLines.length,
    duplicateLinesRemoved,
    durationMs: Date.now() - startTime,
  });

  console.log('\n=== Merge Summary ===');
  console.log(`Local files: ${local.localFilesCount}`);
  console.log(`Remote URLs: ${remote.remoteUrlsCount}`);
  console.log(`Imported lines: ${importedLines}`);
  console.log(`Unique lines: ${uniqueLines.length}`);
  console.log(`Duplicates removed: ${duplicateLinesRemoved}`);

  // Validation stage
  console.log('\n=== Starting Validation Pipeline ===');
  const validationStartTime = Date.now();
  const { stats, results } = await validateConfigurations(uniqueLines);
  const validationDuration = Date.now() - validationStartTime;

  const healthReport = generateHealthReport({
    stats,
    totalHealthy: results.healthy.length,
    durationMs: validationDuration,
  });

  console.log('\n=== Validation Summary ===');
  console.log(`Total configurations: ${stats.total}`);
  console.log(`Passed Stage 1 (Syntax): ${stats.stage1_syntax}`);
  console.log(`Passed Stage 2 (Decode): ${stats.stage2_decode}`);
  console.log(`Passed Stage 3 (Required Fields): ${stats.stage3_required_fields}`);
  console.log(`Passed Stage 4 (DNS): ${stats.stage4_dns}`);
  console.log(`Passed Stage 5 (TCP): ${stats.stage5_tcp}`);
  console.log(`Health Rate: ${healthReport.summary.healthRate}`);
  console.log(`Validation Time: ${validationDuration}ms`);

  // Collect all failed configurations for bad_configs.txt
  const badConfigs = [
    ...results.failed_syntax,
    ...results.failed_decode,
    ...results.failed_required_fields,
    ...results.failed_dns,
    ...results.failed_tcp,
  ];

  const totalDuration = Date.now() - startTime;
  console.log(`\nTotal execution time: ${totalDuration}ms`);

  await saveOutputs(uniqueLines, results.healthy, badConfigs, statistics, healthReport);

  // --- Second pipeline: process Sub Links2.txt into merged2 / merged_checked2 ---
  try {
    console.log('\nStarting second pipeline using Sub Links2.txt (merged2/merged_checked2)...');

    const remote2 = await loadRemoteSubscriptionsFrom(SUB_LINKS2_PATH, 'Sub Links2.txt');
    const importedLines2 = local.lines.length + remote2.lines.length;

    const normalized2 = normalizeLines([...local.lines, ...remote2.lines]);
    const { uniqueLines: uniqueLines2, duplicateLinesRemoved: duplicateLinesRemoved2 } = removeDuplicates(normalized2);

    const statistics2 = generateStatistics({
      localFilesCount: local.localFilesCount,
      remoteUrlsCount: remote2.remoteUrlsCount,
      importedLines: importedLines2,
      uniqueLinesCount: uniqueLines2.length,
      duplicateLinesRemoved: duplicateLinesRemoved2,
      durationMs: Date.now() - startTime,
    });

    console.log('\n=== Merge Summary (Sub Links2) ===');
    console.log(`Local files: ${local.localFilesCount}`);
    console.log(`Remote URLs: ${remote2.remoteUrlsCount}`);
    console.log(`Imported lines: ${importedLines2}`);
    console.log(`Unique lines: ${uniqueLines2.length}`);
    console.log(`Duplicates removed: ${duplicateLinesRemoved2}`);

    console.log('\n=== Starting Validation Pipeline (Sub Links2) ===');
    const validationStartTime2 = Date.now();
    const { stats: stats2, results: results2 } = await validateConfigurations(uniqueLines2);
    const validationDuration2 = Date.now() - validationStartTime2;

    const healthReport2 = generateHealthReport({
      stats: stats2,
      totalHealthy: results2.healthy.length,
      durationMs: validationDuration2,
    });

    const badConfigs2 = [
      ...results2.failed_syntax,
      ...results2.failed_decode,
      ...results2.failed_required_fields,
      ...results2.failed_dns,
      ...results2.failed_tcp,
    ];

    await saveOutputsVariant(uniqueLines2, MERGED2_ROOT_PATH, MERGED2_OUTPUT_PATH, MERGED_CHECKED2_ROOT_PATH, MERGED_CHECKED2_OUTPUT_PATH, results2.healthy, badConfigs2, BAD_CONFIGS_PATH.replace('.txt', '_2.txt'));
  } catch (e) {
    console.error('Second pipeline failed:', e && e.message ? e.message : e);
  }
}

run().catch((error) => {
  console.error('Subscription merge and validation failed:', error instanceof Error ? error.message : error);
  if (error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

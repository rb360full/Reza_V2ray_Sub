const fs = require('fs/promises');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'configs');
const SUB_LINKS_PATH = path.join(ROOT_DIR, 'Sub Links.txt');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const MERGED_ROOT_PATH = path.join(ROOT_DIR, 'merged.txt');
const MERGED_OUTPUT_PATH = path.join(OUTPUT_DIR, 'merged.txt');
const REPORT_PATH = path.join(OUTPUT_DIR, 'report.json');

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
 * Save merged output files to the repository root and output folder.
 */
async function saveOutputs(lines, statistics) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const mergedContent = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  await Promise.all([
    fs.writeFile(MERGED_ROOT_PATH, mergedContent, 'utf8'),
    fs.writeFile(MERGED_OUTPUT_PATH, mergedContent, 'utf8'),
    fs.writeFile(REPORT_PATH, JSON.stringify(statistics, null, 2) + '\n', 'utf8'),
  ]);

  console.log(`Saved merged subscription to: ${MERGED_ROOT_PATH}`);
  console.log(`Saved merged subscription to: ${MERGED_OUTPUT_PATH}`);
  console.log(`Saved statistics report to: ${REPORT_PATH}`);
}

/**
 * Main workflow: load, normalize, deduplicate, save, and report.
 */
async function run() {
  const startTime = Date.now();

  console.log('Starting V2Ray subscription merge process...');

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

  console.log('Merge completed.');
  console.log(`Imported lines: ${importedLines}`);
  console.log(`Unique lines: ${uniqueLines.length}`);
  console.log(`Duplicate lines removed: ${duplicateLinesRemoved}`);
  console.log(`Execution time: ${statistics.executionTimeMs}ms`);

  await saveOutputs(uniqueLines, statistics);
}

run().catch((error) => {
  console.error('Subscription merge failed:', error instanceof Error ? error.message : error);
  if (error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

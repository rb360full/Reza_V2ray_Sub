const { promisify } = require('util');
const { resolve4, resolve6 } = require('dns');
const net = require('net');
// p-queue is an ES module; import dynamically inside async functions to remain
// compatible with CommonJS execution in GitHub Actions runners.

/**
 * Configuration validation pipeline with staged execution.
 * Validates only pass to the next stage if they succeed in the current stage.
 */

// Environment configuration
const TCP_TIMEOUT_MS = parseInt(process.env.TCP_TIMEOUT_MS || '2000', 10);
const DNS_RETRIES = parseInt(process.env.DNS_RETRIES || '1', 10);
const TCP_RETRIES = parseInt(process.env.TCP_RETRIES || '1', 10);
const VALIDATION_CONCURRENCY = parseInt(process.env.VALIDATION_CONCURRENCY || '50', 10);

const dnsResolve4 = promisify(resolve4);
const dnsResolve6 = promisify(resolve6);

/**
 * Stage 1: Syntax validation
 * Check if the line looks like a valid V2Ray configuration.
 */
function validateSyntax(line) {
  if (!line || typeof line !== 'string') {
    return { valid: false, reason: 'Empty or invalid type' };
  }

  line = line.trim();

  // Check for common V2Ray protocols
  const validPrefixes = ['vmess://', 'vless://', 'ss://', 'ssr://', 'trojan://', 'http://', 'https://'];
  const hasValidPrefix = validPrefixes.some((prefix) => line.toLowerCase().startsWith(prefix));

  if (!hasValidPrefix) {
    return { valid: false, reason: 'Invalid protocol prefix' };
  }

  if (line.length < 10) {
    return { valid: false, reason: 'Configuration too short' };
  }

  return { valid: true, reason: 'Syntax OK' };
}

/**
 * Stage 2: Decode validation
 * Attempt to decode base64 payload if it's a vmess/vless configuration.
 */
function validateDecode(line) {
  try {
    if (line.toLowerCase().startsWith('vmess://') || line.toLowerCase().startsWith('vless://')) {
      // Extract the payload portion and strip URL params and fragment (# or ?)
      let base64Part = line.split('://')[1] || '';
      const hashIndex = base64Part.indexOf('#');
      if (hashIndex !== -1) base64Part = base64Part.slice(0, hashIndex);
      const qIndex = base64Part.indexOf('?');
      if (qIndex !== -1) base64Part = base64Part.slice(0, qIndex);
      if (!base64Part) {
        return { valid: false, reason: 'No payload after protocol' };
      }

      // Try to decode as base64
      const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
      if (!decoded || decoded.length < 2) {
        return { valid: false, reason: 'Failed to decode base64 payload' };
      }

      // Try to parse as JSON
      try {
        JSON.parse(decoded);
      } catch (e) {
        return { valid: false, reason: 'Decoded payload is not valid JSON' };
      }

      return { valid: true, reason: 'Decode OK' };
    }

    return { valid: true, reason: 'Decode OK (non-JSON protocol)' };
  } catch (error) {
    return { valid: false, reason: `Decode error: ${error.message}` };
  }
}

/**
 * Stage 3: Required fields validation
 * Extract and validate required fields from decoded configuration.
 */
function validateRequiredFields(line) {
  try {
    if (line.toLowerCase().startsWith('vmess://') || line.toLowerCase().startsWith('vless://')) {
      // Extract payload and strip URL params/fragments
      let base64Part = line.split('://')[1] || '';
      const hashIndex2 = base64Part.indexOf('#');
      if (hashIndex2 !== -1) base64Part = base64Part.slice(0, hashIndex2);
      const qIndex2 = base64Part.indexOf('?');
      if (qIndex2 !== -1) base64Part = base64Part.slice(0, qIndex2);
      const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
      const config = JSON.parse(decoded);

      // Check for required fields
      const requiredFields = ['add', 'port'];
      for (const field of requiredFields) {
        if (!config[field]) {
          return { valid: false, reason: `Missing required field: ${field}`, config: null };
        }
      }

      return { valid: true, reason: 'Required fields OK', config };
    }

    // For other protocols, basic validation
    if (line.toLowerCase().includes('://')) {
      return { valid: true, reason: 'Required fields OK (non-JSON protocol)', config: null };
    }

    return { valid: false, reason: 'Invalid configuration format', config: null };
  } catch (error) {
    return { valid: false, reason: `Required fields error: ${error.message}`, config: null };
  }
}

/**
 * Stage 4: DNS validation
 * Resolve the hostname/IP address using DNS.
 */
async function validateDNS(config) {
  if (!config || !config.add) {
    return { valid: false, reason: 'No hostname/IP to validate' };
  }

  const hostname = config.add;

  // If it's an IP address (IPv4 or IPv6), skip DNS validation
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || /^[0-9a-f:]+$/i.test(hostname)) {
    return { valid: true, reason: 'IP address (DNS skipped)' };
  }

  for (let attempt = 0; attempt < DNS_RETRIES; attempt++) {
    try {
      // Try IPv4 resolution
      const result = await dnsResolve4(hostname);
      if (result && result.length > 0) {
        return { valid: true, reason: `DNS OK (resolved to ${result[0]})` };
      }
    } catch (e) {
      if (attempt === DNS_RETRIES - 1) {
        return { valid: false, reason: `DNS resolution failed: ${e.message}` };
      }
    }
  }

  return { valid: false, reason: 'DNS resolution failed after retries' };
}

/**
 * Stage 5: TCP validation
 * Attempt to establish a TCP connection to the server.
 * Only runs if DNS validation passed.
 */
async function validateTCP(config) {
  if (!config || !config.add || !config.port) {
    return { valid: false, reason: 'No hostname or port to validate' };
  }

  const hostname = config.add;
  const port = parseInt(config.port, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    return { valid: false, reason: `Invalid port: ${config.port}` };
  }

  for (let attempt = 0; attempt < TCP_RETRIES; attempt++) {
    try {
      const result = await tcpConnect(hostname, port, TCP_TIMEOUT_MS);
      if (result) {
        return { valid: true, reason: `TCP OK (${hostname}:${port})` };
      }
    } catch (e) {
      if (attempt === TCP_RETRIES - 1) {
        return { valid: false, reason: `TCP connection failed: ${e.message}` };
      }
    }
  }

  return { valid: false, reason: 'TCP connection failed after retries' };
}

/**
 * Establish a TCP connection with a timeout.
 */
function tcpConnect(hostname, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: hostname, port, timeout: timeoutMs });

    const onConnect = () => {
      socket.destroy();
      resolve(true);
    };

    const onError = (error) => {
      socket.destroy();
      reject(error);
    };

    const onTimeout = () => {
      socket.destroy();
      reject(new Error(`TCP timeout after ${timeoutMs}ms`));
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);

    setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP timeout after ${timeoutMs}ms`));
    }, timeoutMs + 100);
  });
}

/**
 * Main validation pipeline.
 * Runs configurations through all stages and returns results at each stage.
 */
async function validateConfigurations(lines) {
  const stats = {
    total: lines.length,
    stage1_syntax: 0,
    stage2_decode: 0,
    stage3_required_fields: 0,
    stage4_dns: 0,
    stage5_tcp: 0,
  };

  const results = {
    healthy: [],
    failed_syntax: [],
    failed_decode: [],
    failed_required_fields: [],
    failed_dns: [],
    failed_tcp: [],
  };

  // Stage 1: Syntax Validation
  console.log(`\n[Stage 1] Validating syntax for ${lines.length} configurations...`);
  const stage1Configs = [];

  for (const line of lines) {
    const validation = validateSyntax(line);
    if (validation.valid) {
      stats.stage1_syntax += 1;
      stage1Configs.push({ line, config: null });
    } else {
      results.failed_syntax.push({ line, reason: validation.reason });
    }
  }

  console.log(`[Stage 1] Passed: ${stats.stage1_syntax}/${lines.length}`);

  // Stage 2: Decode Validation
  console.log(`\n[Stage 2] Validating decode for ${stage1Configs.length} configurations...`);
  const stage2Configs = [];

  for (const item of stage1Configs) {
    const validation = validateDecode(item.line);
    if (validation.valid) {
      stats.stage2_decode += 1;
      stage2Configs.push(item);
    } else {
      results.failed_decode.push({ line: item.line, reason: validation.reason });
    }
  }

  console.log(`[Stage 2] Passed: ${stats.stage2_decode}/${stage1Configs.length}`);

  // Stage 3: Required Fields Validation
  console.log(`\n[Stage 3] Validating required fields for ${stage2Configs.length} configurations...`);
  const stage3Configs = [];

  for (const item of stage2Configs) {
    const validation = validateRequiredFields(item.line);
    if (validation.valid) {
      stats.stage3_required_fields += 1;
      stage3Configs.push({ line: item.line, config: validation.config });
    } else {
      results.failed_required_fields.push({ line: item.line, reason: validation.reason });
    }
  }

  console.log(`[Stage 3] Passed: ${stats.stage3_required_fields}/${stage2Configs.length}`);

  // Stage 4: DNS Validation (with concurrency pool)
  console.log(`\n[Stage 4] Validating DNS for ${stage3Configs.length} configurations...`);
  const { default: PQueue } = await import('p-queue');
  const dnsQueue = new PQueue({ concurrency: VALIDATION_CONCURRENCY });
  const stage4Results = [];

  const dnsPromises = stage3Configs.map((item) =>
    dnsQueue.add(async () => {
      const validation = await validateDNS(item.config || {});
      return { item, validation };
    })
  );

  const dnsValidations = await Promise.all(dnsPromises);

  for (const { item, validation } of dnsValidations) {
    if (validation.valid) {
      stats.stage4_dns += 1;
      stage4Results.push(item);
    } else {
      results.failed_dns.push({ line: item.line, reason: validation.reason });
    }
  }

  console.log(`[Stage 4] Passed: ${stats.stage4_dns}/${stage3Configs.length}`);

  // Stage 5: TCP Validation (only for DNS-passing configs, with concurrency pool)
  console.log(`\n[Stage 5] Validating TCP for ${stage4Results.length} configurations...`);
  const { default: PQueue2 } = await import('p-queue');
  const tcpQueue = new PQueue2({ concurrency: VALIDATION_CONCURRENCY });

  const tcpPromises = stage4Results.map((item) =>
    tcpQueue.add(async () => {
      const validation = await validateTCP(item.config || {});
      return { item, validation };
    })
  );

  const tcpValidations = await Promise.all(tcpPromises);

  for (const { item, validation } of tcpValidations) {
    if (validation.valid) {
      stats.stage5_tcp += 1;
      results.healthy.push(item.line);
    } else {
      results.failed_tcp.push({ line: item.line, reason: validation.reason });
    }
  }

  console.log(`[Stage 5] Passed: ${stats.stage5_tcp}/${stage4Results.length}`);

  return { stats, results };
}

module.exports = {
  validateConfigurations,
  validateSyntax,
  validateDecode,
  validateRequiredFields,
  validateDNS,
  validateTCP,
};

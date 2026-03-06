// Shared module: adaptive-concurrency pool, runAgent, extractJSON.
//
// The pool hill-climbs on throughput: starts at concurrency 1, measures
// tasks/second, increases concurrency until there's no gain, then holds.
// Rate-limit errors trigger a halve + retry with exponential backoff.
//
// Usage:
//   const { createPool, runAgent, extractJSON } = require('./lib/agent-pool');
//   const pool = createPool({ maxConcurrency: 10 });
//   await pool.run(tasks, async (task, idx) => { ... });

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

// ── Run a CLI agent on a single prompt ───────────────────────────────────────
// Supports both Cursor `agent` and Google `gemini` CLIs.
function runAgent(prompt, id, { model = "", agentBin = "agent" } = {}) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `agent-prompt-${process.pid}-${id}.txt`
    );
    fs.writeFileSync(tmpFile, prompt, "utf-8");

    const isGemini = /\bgemini\b/.test(agentBin);

    let agentArgs;
    if (isGemini) {
      agentArgs = ["-p", '""', "-y", "-o", "text"];
      if (model) agentArgs.push("-m", model);
    } else {
      agentArgs = ["-p", "--trust", "--output-format", "text", "--mode", "ask"];
      if (model) agentArgs.push("--model", model);
    }

    const catCmd = process.platform === "win32" ? "type" : "cat";
    const cmd = `${catCmd} "${tmpFile}" | ${agentBin} ${agentArgs.join(" ")}`;

    const child = spawn(cmd, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10 * 60 * 1000,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("close", (code) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      if (code !== 0) {
        return reject(new Error(
          `agent exited ${code}: ${stderr.slice(0, 500) || stdout.slice(0, 500)}`
        ));
      }
      resolve(stdout);
    });

    child.on("error", (err) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      reject(err);
    });
  });
}

// ── Extract JSON from agent output ──────────────────────────────────────────
function extractJSON(raw) {
  // Try direct parse first (ideal case: model returned pure JSON)
  try { return JSON.parse(raw.trim()); } catch {}

  // Strip markdown code fences
  const stripped = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}

  // Find JSON object in text
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }

  return null;
}

// ── Extract JSON array from agent output ─────────────────────────────────────
function extractJSONArray(raw) {
  // Try direct parse first
  try {
    const parsed = JSON.parse(raw.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {}

  // Strip markdown code fences
  const stripped = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {}

  // Find JSON array in text
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {}
  }

  // Fall back to single object → wrap in array
  const obj = extractJSON(raw);
  if (obj) return [obj];
  return null;
}

// ── Rate limit detection ────────────────────────────────────────────────────
const RATE_LIMIT_PATTERNS = [
  /429/i,
  /rate.?limit/i,
  /rate_limit/i,
  /too many requests/i,
  /usage.?limit/i,
  /error when talking to gemini api/i,
];

// Daily/terminal quota — should stop, not retry
const QUOTA_EXHAUSTED_PATTERNS = [
  /exhausted your daily quota/i,
  /TerminalQuotaError/i,
];

function isRateLimitError(err) {
  const msg = err && err.message ? err.message : String(err);
  return RATE_LIMIT_PATTERNS.some((re) => re.test(msg));
}

function isQuotaExhausted(err) {
  const msg = err && err.message ? err.message : String(err);
  return QUOTA_EXHAUSTED_PATTERNS.some((re) => re.test(msg));
}

class QuotaExhaustedError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

// ── Adaptive Pool ───────────────────────────────────────────────────────────
function createPool({ maxConcurrency = 5 } = {}) {
  let concurrency = 1; // start low, climb up
  const minConcurrency = 1;

  // Throughput tracking: measure completions per second over a window
  const WINDOW_SIZE = 5; // evaluate after every N completions
  let windowStart = 0;
  let windowCompletions = 0;
  let prevThroughput = 0; // tasks/sec at previous concurrency level
  let prevConcurrency = 0;
  let settled = false; // true once we've found the optimal level

  // Backoff for rate limits
  const BASE_BACKOFF_MS = 5000;
  const MAX_BACKOFF_MS = 60000;

  function onTaskComplete(taskElapsedMs) {
    // Skip near-instant completions (e.g. resumed/cached tasks) — they
    // don't represent real work and would distort throughput measurement.
    if (taskElapsedMs < 1000) return;

    windowCompletions++;
    if (windowCompletions < WINDOW_SIZE) return;

    const elapsed = (Date.now() - windowStart) / 1000;
    if (elapsed < 1) return; // guard against division by near-zero
    const throughput = windowCompletions / elapsed;

    if (!settled && prevConcurrency > 0 && prevConcurrency < concurrency) {
      // We just increased — did throughput improve?
      const gain = (throughput - prevThroughput) / prevThroughput;
      if (gain < 0.05) {
        // No meaningful gain (< 5%) — back off and settle
        const prev = concurrency;
        concurrency = Math.max(minConcurrency, prevConcurrency);
        settled = true;
        console.log(
          `[pool] settled at concurrency ${concurrency} (was ${prev}, throughput ${throughput.toFixed(2)}/s vs ${prevThroughput.toFixed(2)}/s)`
        );
      } else {
        console.log(
          `[pool] concurrency ${concurrency} → ${throughput.toFixed(2)}/s (+${(gain * 100).toFixed(0)}%), trying higher`
        );
      }
    }

    prevThroughput = throughput;
    prevConcurrency = concurrency;

    // Try increasing if not settled and below max
    if (!settled && concurrency < maxConcurrency) {
      const prev = concurrency;
      concurrency++;
      console.log(`[pool] increasing concurrency: ${prev} → ${concurrency}`);
    }

    // Reset window
    windowCompletions = 0;
    windowStart = Date.now();
  }

  function onRateLimit() {
    const prev = concurrency;
    concurrency = Math.max(minConcurrency, Math.floor(concurrency / 2));
    settled = false; // re-explore after rate limit subsides
    prevThroughput = 0;
    prevConcurrency = 0;
    if (concurrency !== prev) {
      console.log(`[pool] rate limit, concurrency: ${prev} → ${concurrency}`);
    }
  }

  // ── Semaphore-based pool runner ─────────────────────────────────────────
  async function run(tasks, fn) {
    const results = new Array(tasks.length);
    let nextIdx = 0;
    let running = 0;
    let resolveAll;
    const allDone = new Promise((r) => (resolveAll = r));

    windowStart = Date.now();

    function trySpawn() {
      while (running < concurrency && nextIdx < tasks.length) {
        const i = nextIdx++;
        running++;
        executeTask(i).then(() => {
          running--;
          if (nextIdx >= tasks.length && running === 0) {
            resolveAll();
          } else {
            trySpawn();
          }
        });
      }
      if (tasks.length === 0) resolveAll();
    }

    async function executeTask(i) {
      let backoffMs = BASE_BACKOFF_MS;
      let retries = 0;
      const MAX_RETRIES = 5;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const startTime = Date.now();
        try {
          results[i] = await fn(tasks[i], i);
          onTaskComplete(Date.now() - startTime);
          backoffMs = BASE_BACKOFF_MS;
          return;
        } catch (err) {
          if (isQuotaExhausted(err)) {
            console.log(`[pool] daily quota exhausted — stopping gracefully`);
            throw new QuotaExhaustedError(err.message);
          }
          if (isRateLimitError(err) && retries < MAX_RETRIES) {
            retries++;
            onRateLimit();
            console.log(`[pool] retrying task ${i} (${retries}/${MAX_RETRIES}) after ${(backoffMs / 1000).toFixed(0)}s backoff`);
            await sleep(backoffMs);
            backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
          } else {
            throw err;
          }
        }
      }
    }

    trySpawn();
    await allDone;
    return results;
  }

  return { run };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { createPool, runAgent, extractJSON, extractJSONArray, isRateLimitError, QuotaExhaustedError };

// Cassette engine — record/replay system for simulation tool responses.
//
// Inspired by Ruby's VCR gem and Polly.js. Every tool call that would
// reach a real MCP server passes through this layer.
//
// REPLAY mode: loads responses from JSON cassette files (no API key needed)
// RECORD mode: calls real handler, saves the response to cassette file
// LIVE mode:   calls real handler, verifies output matches cassette (warns on drift)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { MockToolHandler, SimMode } from './scenarios/types.js';

// ─── Cassette file format ─────────────────────────────────────────────────────

interface CassetteEntry {
  toolName: string;
  inputHash: string; // SHA-256 of JSON.stringify(input) — used for matching
  input: unknown; // Raw input for human readability
  output: unknown; // Recorded response
  durationMs: number;
  recordedAt: string; // ISO timestamp
}

interface CassetteFile {
  scenarioSlug: string;
  version: '1';
  entries: CassetteEntry[];
}

// ─── Cassette store ───────────────────────────────────────────────────────────

const CASSETTES_DIR = new URL('../../cassettes', import.meta.url).pathname;

function cassetteDir(scenarioSlug: string): string {
  return join(CASSETTES_DIR, scenarioSlug);
}

function cassetteFilePath(scenarioSlug: string): string {
  return join(cassetteDir(scenarioSlug), 'tool-calls.json');
}

function inputHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

export function loadCassette(scenarioSlug: string): CassetteFile | null {
  const filePath = cassetteFilePath(scenarioSlug);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as CassetteFile;
}

export function saveCassette(scenarioSlug: string, cassette: CassetteFile): void {
  const dir = cassetteDir(scenarioSlug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(cassetteFilePath(scenarioSlug), JSON.stringify(cassette, null, 2), 'utf-8');
}

// ─── Forward function factory ─────────────────────────────────────────────────

// Returns a ForwardFn suitable for injection into ProxyConfig.forwardFn.
// The behaviour changes based on mode:
//   replay: serves from cassette (error if not found)
//   record: calls real handler, saves to cassette
//   live:   calls real handler, compares to cassette (warns on drift)

export function createForwardFn(
  scenarioSlug: string,
  mode: SimMode,
  handlers: Record<string, MockToolHandler>,
): (toolName: string, input: unknown) => Promise<{ output: unknown; durationMs: number }> {
  // Load existing cassette for replay/live modes
  let cassette = loadCassette(scenarioSlug);
  const newEntries: CassetteEntry[] = [];

  return async (toolName: string, input: unknown) => {
    const hash = inputHash(input);
    const start = Date.now();

    if (mode === 'replay') {
      // Replay from cassette when available — fall back to handler if not.
      // This ensures the simulation works out-of-the-box without pre-recorded cassettes
      // (first run auto-records; subsequent runs replay the deterministic handler responses).
      if (cassette) {
        const entry = cassette.entries.find(
          (e) => e.toolName === toolName && e.inputHash === hash,
        );
        if (entry) {
          return { output: entry.output, durationMs: entry.durationMs };
        }
        console.warn(
          `[CASSETTE MISS] No entry for "${toolName}" (hash ${hash}) in "${scenarioSlug}". Falling back to handler.`,
        );
      }
      // Fall through to handler below (no cassette or cache miss)
    }

    // RECORD or LIVE — call the real handler
    const handler = handlers[toolName];
    if (!handler) {
      throw new Error(
        `No mock handler registered for tool "${toolName}" in scenario "${scenarioSlug}". ` +
          `Add it to the scenario's toolHandlers map.`,
      );
    }

    const result = await handler(input);
    const durationMs = Date.now() - start;

    if (mode === 'live' && cassette) {
      // Verify output matches cassette (warn but don't fail)
      const existing = cassette.entries.find(
        (e) => e.toolName === toolName && e.inputHash === hash,
      );
      if (existing) {
        const recordedHash = createHash('sha256')
          .update(JSON.stringify(existing.output))
          .digest('hex');
        const liveHash = createHash('sha256')
          .update(JSON.stringify(result.output))
          .digest('hex');
        if (recordedHash !== liveHash) {
          console.warn(
            `[CASSETTE DRIFT] Tool "${toolName}" in "${scenarioSlug}": ` +
              `live response differs from recorded cassette. Consider re-recording.`,
          );
        }
      }
    }

    if (mode === 'record') {
      newEntries.push({
        toolName,
        inputHash: hash,
        input,
        output: result.output,
        durationMs,
        recordedAt: new Date().toISOString(),
      });
    }

    return { output: result.output, durationMs };
  };
}

// Called after all scenario steps complete in RECORD mode — flushes new entries
export function flushCassette(scenarioSlug: string, newEntries: CassetteEntry[]): void {
  if (newEntries.length === 0) return;
  const existing = loadCassette(scenarioSlug);
  const merged: CassetteFile = {
    scenarioSlug,
    version: '1',
    entries: existing ? [...existing.entries, ...newEntries] : newEntries,
  };
  // Deduplicate by toolName + inputHash (keep latest)
  const seen = new Set<string>();
  merged.entries = merged.entries
    .reverse()
    .filter((e) => {
      const key = `${e.toolName}:${e.inputHash}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .reverse();
  saveCassette(scenarioSlug, merged);
}

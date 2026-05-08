// Output summarization — shared by hook PostToolUse and MCP proxy response paths.
//
// Both paths need the same truncate/preview/hash logic. Extracting here keeps
// processHookEvent and the gateway response callback in sync.

import { createHash } from 'node:crypto';

const MAX_OUTPUT_BYTES = 4096;
const PREVIEW_BYTES = 1024;

export interface OutputSummary {
	outputPreview?: string;
	outputTruncated?: boolean;
	outputSizeBytes?: number;
	outputHash?: string;
}

/**
 * Serialize tool output and produce a storage-safe summary.
 *
 * CONTRACT:
 * - Input: output (any value, including null/undefined)
 * - Output: OutputSummary — all fields optional; empty object if output is null/undefined
 * - Errors: none
 * - Side effects: none
 * - Invariants: if outputTruncated is true, outputPreview is set to MAX_OUTPUT_BYTES chars;
 *   if outputSizeBytes is set, it reflects byte length of the original serialized output
 */
export function summarizeOutput(output: unknown): OutputSummary {
	if (output == null) return {};

	const text = typeof output === 'string' ? output : JSON.stringify(output);
	const sizeBytes = Buffer.byteLength(text, 'utf-8');
	const hash = createHash('sha256').update(text).digest('hex');

	if (text.length > MAX_OUTPUT_BYTES) {
		return {
			outputPreview: text.slice(0, MAX_OUTPUT_BYTES),
			outputTruncated: true,
			outputSizeBytes: sizeBytes,
			outputHash: hash,
		};
	}

	return {
		outputPreview: text.slice(0, PREVIEW_BYTES),
		outputSizeBytes: sizeBytes,
		outputHash: hash,
	};
}

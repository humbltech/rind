// Streaming output helpers — makes simulation output look like a real agent.
// Text streams character-by-character, tool calls show a spinner, results appear after a pause.

const CHAR_DELAY_MS = 12; // per-character delay for streaming text
const TOOL_CALL_DELAY_MS = 1500; // pause while "calling" a tool
const STEP_PAUSE_MS = 800; // pause between steps
const RESULT_PAUSE_MS = 500; // pause before showing result

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Write text character by character to stdout, like a chatbot streaming response. */
export async function streamText(text: string, delayMs = CHAR_DELAY_MS): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    if (char !== ' ' && char !== '\n') {
      await sleep(delayMs);
    }
  }
}

/** Write a full line with streaming effect, then newline. */
export async function streamLine(text: string, delayMs = CHAR_DELAY_MS): Promise<void> {
  await streamText(text, delayMs);
  process.stdout.write('\n');
}

/** Show a spinner animation for the given duration, then clear it. */
export async function showSpinner(label: string, durationMs = TOOL_CALL_DELAY_MS): Promise<void> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const interval = 80;
  const iterations = Math.floor(durationMs / interval);

  for (let i = 0; i < iterations; i++) {
    const frame = frames[i % frames.length];
    process.stdout.write(`\r  \x1b[36m${frame}\x1b[0m  ${label}`);
    await sleep(interval);
  }
  // Clear the spinner line
  process.stdout.write(`\r${' '.repeat(label.length + 10)}\r`);
}

export async function pauseBetweenSteps(): Promise<void> {
  await sleep(STEP_PAUSE_MS);
}

export async function pauseBeforeResult(): Promise<void> {
  await sleep(RESULT_PAUSE_MS);
}

export { TOOL_CALL_DELAY_MS, STEP_PAUSE_MS };

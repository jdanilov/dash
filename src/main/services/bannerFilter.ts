// --- Banner logo replacement: swap Claude shield with block-art "7" ---
//
// ▛▘▌▌▌▌  ▀▌▌   Opus 4.6 · Claude Max
// ▄▌▙▌▚▘▗ █▌▌   ~/Desktop/project
//   ▄▌            Status message...

const RESET = '\x1b[0m';
// Claude orange/terracotta — matches the shield logo color
const SEVEN_COLOR = '\x1b[38;2;217;119;87m';

// Gap pattern: match any non-newline, non-block chars between shield characters.
// This absorbs ANSI escape sequences (SGR, cursor, OSC, etc.) and spaces.
const B = '[^\\n\\u2580-\\u259F]{0,40}?';

// Shield line 1: ▐▛███▜▌ (with space before ▐)
const LINE1_RE = new RegExp(` ${B}\\u2590${B}\\u259B${B}\\u2588${B}\\u2588${B}\\u2588${B}\\u259C${B}\\u258C`);

// Shield line 2: ▝▜█████▛▘
const LINE2_RE = new RegExp(`\\u259D${B}\\u259C${B}\\u2588${B}\\u2588${B}\\u2588${B}\\u2588${B}\\u2588${B}\\u259B${B}\\u2598`);

// Shield line 3: ▘▘ ▝▝
const LINE3_RE = new RegExp(`\\u2598${B}\\u2598${B}\\u259D${B}\\u259D`);

const BUFFER_MAX_BYTES = 16384;

/**
 * Creates a filter that replaces the Claude shield with a block-art "7" in early PTY output.
 * The "7" is rendered in Claude's orange/terracotta color to match the original shield.
 *
 * Buffers early PTY data and checks for all 3 shield line patterns. If all are found,
 * replacements are applied and the modified buffer is flushed. If the buffer exceeds 16KB
 * without matching all 3 patterns, the original data is flushed unchanged — gracefully
 * falling back if the banner format changes in a new Claude Code version.
 */
export function createBannerFilter(forward: (data: string) => void): (data: string) => void {
  let buffer = '';
  let done = false;

  function flush(content: string) {
    done = true;
    buffer = '';
    forward(content);
  }

  return (data: string) => {
    if (done) {
      forward(data);
      return;
    }

    buffer += data;

    // Check if all 3 shield patterns are present
    const hasAll = LINE1_RE.test(buffer) && LINE2_RE.test(buffer) && LINE3_RE.test(buffer);

    if (hasAll) {
      // All shield lines detected — apply replacements and flush
      let result = buffer;
      result = result.replace(LINE1_RE, `${SEVEN_COLOR}\u259B\u2598\u258C\u258C\u258C\u258C  \u2580\u258C\u258C${RESET}`);
      result = result.replace(LINE2_RE, `${SEVEN_COLOR}\u2584\u258C\u2599\u258C\u259A\u2598\u2597 \u2588\u258C\u258C${RESET} `);
      result = result.replace(LINE3_RE, `${SEVEN_COLOR}\u2584\u258C${RESET}      `);
      flush(result);
      return;
    }

    // Buffer limit exceeded without full match — flush original unchanged
    if (buffer.length > BUFFER_MAX_BYTES) {
      flush(buffer);
    }
  };
}

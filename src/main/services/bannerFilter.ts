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

/**
 * Creates a filter that replaces the Claude shield with a block-art "7" in early PTY output.
 * The "7" is rendered in Claude's orange/terracotta color to match the original shield.
 * Stops scanning after all 3 shield lines are replaced or 32KB of data has passed.
 */
export function createBannerFilter(forward: (data: string) => void): (data: string) => void {
  let line1Done = false;
  let line2Done = false;
  let line3Done = false;
  let bytesSeen = 0;

  return (data: string) => {
    if ((line1Done && line2Done && line3Done) || bytesSeen > 32768) {
      forward(data);
      return;
    }

    bytesSeen += data.length;
    let result = data;

    // Line 1: ▛▘▌▌▌▌  ▀▌▌
    if (!line1Done) {
      const replaced = result.replace(LINE1_RE, () => {
        return `${SEVEN_COLOR}\u259B\u2598\u258C\u258C\u258C\u258C  \u2580\u258C\u258C${RESET}`;
      });
      if (replaced !== result) {
        line1Done = true;
        result = replaced;
      }
    }

    // Line 2: ▄▌▙▌▚▘▗ █▌▌
    if (!line2Done) {
      const replaced = result.replace(LINE2_RE, () => {
        return `${SEVEN_COLOR}\u2584\u258C\u2599\u258C\u259A\u2598\u2597 \u2588\u258C\u258C${RESET} `;
      });
      if (replaced !== result) {
        line2Done = true;
        result = replaced;
      }
    }

    // Line 3:   ▄▌
    if (!line3Done) {
      const replaced = result.replace(LINE3_RE, () => {
        return `${SEVEN_COLOR}\u2584\u258C${RESET}      `;
      });
      if (replaced !== result) {
        line3Done = true;
        result = replaced;
      }
    }

    forward(result);
  };
}

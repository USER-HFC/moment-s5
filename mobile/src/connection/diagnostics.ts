type Opener = () => void;
let opener: Opener | null = null;

/** The failure notice lives outside the settings tree, so App registers the page change. */
export function registerDiagnosticsOpener(open: Opener) {
  opener = open;
  return () => { if (opener === open) opener = null; };
}

export function openDiagnosticsPage() {
  opener?.();
}

// A shared log is copied and sent to other apps. Never let a camera serial ride along.
const SERIAL_LINE = /序列号|serial\s*number|serialnumber/i;
// CaptureEngine writes "<elapsed> <wall-clock millis> <message>". Elapsed time is boot time; the page shows the wall clock.
const STAMPED_LINE = /^(\d+)\s+(\d{12,16})\s+([\s\S]*)$/;

export function formatDiagnosticClock(epochMs: number) {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDiagnosticLine(line: string) {
  const match = line.match(STAMPED_LINE);
  if (!match) return line;
  const clock = formatDiagnosticClock(Number(match[2]));
  return clock ? `${clock} ${match[3]}` : line;
}

/** Native diagnostics append in time order, so the newest line stays last. */
export function presentDiagnostics(raw: string) {
  return raw.split(/\r?\n/).filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !SERIAL_LINE.test(line);
  }).map(formatDiagnosticLine).join('\n');
}

export function scrollDiagnosticsToEnd(view: {scrollToEnd: (options?: {animated?: boolean}) => void} | null) {
  view?.scrollToEnd({animated: false});
}

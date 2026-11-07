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

/** Native diagnostics append in time order, so the newest line stays last. */
export function presentDiagnostics(raw: string) {
  return raw.split(/\r?\n/).filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !SERIAL_LINE.test(line);
  }).join('\n');
}

export function scrollDiagnosticsToEnd(view: {scrollToEnd: (options?: {animated?: boolean}) => void} | null) {
  view?.scrollToEnd({animated: false});
}

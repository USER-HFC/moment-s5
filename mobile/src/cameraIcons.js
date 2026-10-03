const cameraIcons = {
  grid:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>',
  focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  'focus-auto':'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  'focus-far':'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="m9 12 3-3 3 3-3 3z"/><path d="M12 9V6"/>',
  'focus-near':'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="m9 12 3-3 3 3-3 3z"/><path d="M12 15v3"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v4m-3 0h6"/>',
  usb:'<path d="M12 21V3m-2 2 2-3 2 3M12 16l-5-4V8m5 4 5-4V6"/><circle cx="7" cy="7" r="1"/><path d="M16 3h3v3h-3z"/>',
  motion:'<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3M7 3v3m4-3v3"/>',
  rotate:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 7v4l2 2m3-10 2-2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
};

// Shared verbatim by the H5 prototype and React Native; no redrawn paths.
if (typeof module !== 'undefined') module.exports = cameraIcons;


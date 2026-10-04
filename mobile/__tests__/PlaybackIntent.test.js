const fs = require('fs');
const path = require('path');

// Source-contract guard for the Java bridge. This is not an Android runtime test.
// createChooser copies URI grants/ClipData, but not FLAG_ACTIVITY_NEW_TASK.
const source = fs.readFileSync(path.join(__dirname,
  '../android/app/src/main/java/cn/moment/lumix/MomentS5Module.java'), 'utf8');
const playback = source.slice(source.indexOf('@ReactMethod public void playMoment('),
  source.indexOf('@ReactMethod public void exportMoment('));

it('adds NEW_TASK to the outer chooser launched from ReactApplicationContext', () => {
  expect(playback).toMatch(/Intent chooser\s*=\s*Intent\.createChooser\(intent,\s*"播放动态照片"\)\s*\.addFlags\(Intent\.FLAG_ACTIVITY_NEW_TASK\)/);
  expect(playback).toMatch(/context\.startActivity\(chooser\)/);
});

it('keeps the video URI and read-only grant on the wrapped player intent', () => {
  expect(playback).toMatch(/setDataAndType\(uri,\s*"video\/mp4"\)/);
  expect(playback).toMatch(/\.addFlags\([^;]*Intent\.FLAG_GRANT_READ_URI_PERMISSION/);
  expect(playback).toMatch(/intent\.setClipData\(ClipData\.newRawUri\(video\.getName\(\),\s*uri\)\)/);
  expect(playback).not.toContain('FLAG_GRANT_WRITE_URI_PERMISSION');
});

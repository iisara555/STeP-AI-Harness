// Compatibility entrypoint; shares the maintained packaged acceptance test.
process.argv[2] ||= 'release/win-unpacked/STeP Desktop.exe';
await import('./packaged-launch-smoke.mjs');

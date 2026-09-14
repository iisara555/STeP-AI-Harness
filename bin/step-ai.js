#!/usr/bin/env node

import { main } from '../src/cli/index.js';

main().catch((err) => {
  console.error('\nเกิดข้อผิดพลาด:', err.message);
  process.exit(1);
});

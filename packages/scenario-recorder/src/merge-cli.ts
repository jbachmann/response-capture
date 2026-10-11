#!/usr/bin/env node
import { mergeScenarios } from './files.js';

try {
  const filename = await mergeScenarios(process.argv[2] ?? 'artifacts/api-scenarios');
  console.info(`Wrote ${filename}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

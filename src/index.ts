#!/usr/bin/env node

/**
 * AI Failure Analysis Copilot — Entry Point
 *
 * Run with:
 *   npx tsx src/index.ts analyze --input <path> --output <path>
 */

import { program } from './cli.js';

program.parse();

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { FailureAnalysis, FlakyTestMetric, ParsedFailure } from '../types.js';

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'failure_history.db');
  dbInstance = new Database(dbPath);

  // Initialize schema
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_name TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_category TEXT,
      duration INTEGER,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_test_name ON test_runs(test_name);
  `);

  return dbInstance;
}

export function recordTestResult(
  failure: ParsedFailure,
  analysis?: FailureAnalysis,
  timestamp: string = new Date().toISOString()
): void {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO test_runs (test_name, status, failure_category, duration, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      failure.testName,
      'FAILED',
      analysis?.category || 'Unknown',
      failure.duration,
      timestamp
    );
  } catch (err) {
    console.warn('Failed to record test result in SQLite history DB:', err);
  }
}

export function getFlakyTestMetrics(): FlakyTestMetric[] {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        test_name,
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as total_failures,
        MAX(timestamp) as last_timestamp
      FROM test_runs
      GROUP BY test_name
      HAVING total_runs > 0
      ORDER BY total_failures DESC
    `);

    const rows = stmt.all() as Array<{
      test_name: string;
      total_runs: number;
      total_failures: number;
      last_timestamp: string;
    }>;

    return rows.map(r => {
      const flakinessScore = Math.min(1.0, r.total_failures / Math.max(1, r.total_runs));
      return {
        testName: r.test_name,
        totalRuns: r.total_runs,
        totalFailures: r.total_failures,
        flakinessScore: parseFloat(flakinessScore.toFixed(2)),
        lastStatus: 'FAILED',
        lastRunTimestamp: r.last_timestamp,
      };
    });
  } catch (err) {
    console.warn('Failed to retrieve flaky metrics from SQLite DB:', err);
    return [];
  }
}

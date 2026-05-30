'use strict';

/**
 * DB factory — loads PostgreSQL or SQLite implementation based on DATABASE_URL.
 *
 * SQLite (default):   all methods are synchronous; when awaited they resolve immediately.
 * PostgreSQL:         all methods return Promises; require `npm install pg` first.
 *
 * Usage in server.js:
 *   const { Jobs, Applicants, Applications, Logs, Analytics } = require('./db-factory');
 *   // then use `await Jobs.findAll()` etc.  Works for both backends.
 */

const usePostgres = !!process.env.DATABASE_URL;

if (usePostgres) {
  console.log('[db] Using PostgreSQL (DATABASE_URL detected)');
  module.exports = require('./db-postgres');
} else {
  console.log('[db] Using SQLite (no DATABASE_URL)');

  // Wrap every exported object method in Promise.resolve() so callers can safely
  // `await` them even though the underlying SQLite calls are synchronous.
  const sqlite = require('./db');
  const wrapped = {};

  for (const [exportName, exportedValue] of Object.entries(sqlite)) {
    if (exportName === 'db' || exportName === 'generateId') {
      wrapped[exportName] = exportedValue;
      continue;
    }
    if (typeof exportedValue === 'object' && exportedValue !== null) {
      wrapped[exportName] = {};
      for (const [method, fn] of Object.entries(exportedValue)) {
        if (typeof fn !== 'function') { wrapped[exportName][method] = fn; continue; }
        wrapped[exportName][method] = function (...args) {
          return Promise.resolve(fn.apply(exportedValue, args));
        };
      }
    } else {
      wrapped[exportName] = exportedValue;
    }
  }

  module.exports = wrapped;
}

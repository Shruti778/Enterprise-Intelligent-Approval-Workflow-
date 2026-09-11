/**
 * Builds a throwaway database once per run: drop, create, migrate, seed.
 *
 * sequelize-cli's `test` environment appends `_test` to DB_NAME, so the child
 * processes are handed the base name and can only ever reach the test database.
 *
 * Only the reference-data seeders run. The demo-requests seeder deliberately
 * drives the real services through its own connection built from process.env,
 * which would write into the development database - and tests build their own
 * fixtures anyway.
 */
const path = require('path');
const { execFileSync } = require('child_process');

require('./env.setup.js');

const cwd = path.resolve(__dirname, '..');
const CLI = path.resolve(cwd, 'node_modules', '.bin', 'sequelize-cli');

const REFERENCE_SEEDERS = [
  '20250101100001-departments-and-roles.js',
  '20250101100002-users.js',
  '20250101100003-workflow-definitions.js',
];

// The CLI derives `<DB_NAME>_test` itself, so it gets the base name.
const childEnv = { ...process.env, DB_NAME: process.env.DB_NAME.replace(/_test$/, '') };

function cli(...args) {
  execFileSync(CLI, [...args, '--env', 'test'], { cwd, env: childEnv, stdio: 'pipe' });
}

module.exports = async () => {
  try {
    try {
      cli('db:drop');
    } catch {
      // nothing to drop on the first run
    }
    cli('db:create');
    cli('db:migrate');
    for (const seed of REFERENCE_SEEDERS) cli('db:seed', '--seed', seed);
  } catch (error) {
    const detail = error.stderr ? error.stderr.toString() : error.message;
    throw new Error(`Failed to prepare the test database:\n${detail}`);
  }
};

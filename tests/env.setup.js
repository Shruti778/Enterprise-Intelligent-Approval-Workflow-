/**
 * Runs before any module under test is imported. src/config/env.ts calls
 * dotenv.config(), which never overwrites an existing process.env value, so
 * setting DB_NAME here is what redirects the whole suite onto the test
 * database without touching a line of production code.
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

process.env.NODE_ENV = 'test';

const base = process.env.DB_NAME || 'approval_workflow';
if (!base.endsWith('_test')) process.env.DB_NAME = `${base}_test`;

if (!process.env.DB_NAME.endsWith('_test')) {
  throw new Error(`Refusing to run tests against "${process.env.DB_NAME}"`);
}

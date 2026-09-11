/**
 * Vercel serverless entry point.
 *
 * An Express app is itself a (req, res) handler, so the existing app is
 * exported unchanged. `src/server.ts` remains the entry point for local
 * development and any long-running host; nothing about the app's behaviour,
 * routing or middleware differs between the two.
 */
import { createApp } from '../src/app';

export default createApp();

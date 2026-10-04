// Builds src/ once before any worker starts; the workers inherit DR_URL. A release passes its own build in DR_URL.
import { pathToFileURL } from 'node:url';
import { build, writePage } from '../../tools/build.js';

export default async function globalSetup() {
  if (process.env.DR_URL) return;
  const { html } = await build();
  process.env.DR_URL = pathToFileURL(writePage(html)).href;
}

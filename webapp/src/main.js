/**
 * Main entry point - Modernized
 */

// Set up globals for browser environment
if (typeof window !== 'undefined') {
  window.process = { browser: true, env: {} };
  window.global = window;
  window.globalThis = window;
}

// Import the app
import('./app.js');

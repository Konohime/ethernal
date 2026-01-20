/**
 * App entry point - Modernized
 */
import './init';
import App from './App.svelte';

const app = new App({
  target: document.body,
});

// Useful for debugging
window.app = app;

export default app;

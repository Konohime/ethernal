// CACHE_API is injected at build time by webpack's DefinePlugin
// (see webpack.config.js). For staging/prod it points to the deployed
// backend; for local dev it is empty and we fall back to localhost:3399.
const configured = typeof CACHE_API !== 'undefined' ? CACHE_API : '';
const fallback = `http://${window.location.hostname}:3399`;
const cacheUrl = configured || fallback;

if (configured) {
  console.log('cache api url:', cacheUrl);
} else {
  console.log('cache api url set to local backend', cacheUrl);
}

const cacheUrlPromise = async () => cacheUrl;

export default cacheUrlPromise();

export const fetchCache = path =>
  cacheUrlPromise().then(url =>
    fetch(`${url}/${path}`).then(result => {
      if (!result.ok) {
        throw new Error(`Failed to fetch ${path}: ${result.status}`);
      }
      return result.json();
    }),
  );

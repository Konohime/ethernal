import retry from 'p-retry';

const _fallback = `http://${window.location.hostname}:3399`;

// Force l'utilisation du backend local
const cacheUrlPromise = async () => {
  console.log('cache api url set to local backend', _fallback);
  return _fallback;
};

export default cacheUrlPromise();

export const fetchCache = path =>
  cacheUrlPromise().then(cacheUrl =>
    fetch(`${cacheUrl}/${path}`).then(result => {
      if (!result.ok) {
        throw new Error(`Failed to fetch ${path}: ${result.status}`);
      }
      return result.json();
    }),
  );
<script>
  import router from 'page';
  import * as Sentry from '@sentry/browser';

  import { currentRoom, characterId, characterStatus, currentCombat } from 'lib/cache';
  import wallet from 'stores/wallet';
  import claim from 'stores/claim';
  import preDungeonCheck from 'stores/preDungeonCheck';

  import GameScreen from 'screens/GameScreen';
  import DefaultScreen from 'screens/DefaultScreen';
  import LoadingScreen from 'screens/LoadingScreen';
  import StyleScreen from 'screens/Internal/StyleScreen';

  import Template from 'components/Template';

  // Use MODE instead of process.env.NODE_ENV for Webpack 5
  export const allowGtm = typeof MODE !== 'undefined' && MODE !== 'development';

  let pageScreen;
  router('/_internal/styles', () => {
    pageScreen = StyleScreen;
  });
  router.start();

  // Initialize Sentry
  if (typeof SENTRY_DSN !== 'undefined' && SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      release: typeof COMMIT !== 'undefined' ? COMMIT : 'dev',
      environment: typeof ENV !== 'undefined' ? ENV : 'development',
      beforeSend: (event, hint) => {
        // Skip common fetching errors during deployments
        const error = hint.originalException;
        if (error && error.message && error.message.match(/(failed to fetch|cache api .* not ok|networkerror)/i)) {
          return null;
        }

        event.user = { ...event.user, character: $characterId, wallet: $wallet.address };
        event.tags = { ...event.tags, character: $characterId, wallet: $wallet.address };
        event.extra = {
          ...event.extra,
          character_id: $characterId,
          character_status: $characterStatus,
          room: $currentRoom,
          combat: $currentCombat,
        };
        return event;
      },
    });
    
    Sentry.configureScope(scope => {
      scope.setExtras({ session_at: Date.now() });
      scope.setTags({
        commit: typeof COMMIT !== 'undefined' ? COMMIT : 'dev',
        environment: typeof ENV !== 'undefined' ? ENV : 'development',
        mode: typeof MODE !== 'undefined' ? MODE : 'development',
        eth_node: typeof ETH_URL !== 'undefined' ? ETH_URL : '',
        cache_api: typeof CACHE_API !== 'undefined' ? CACHE_API : '',
        build_ts: typeof BUILD_TIMESTAMP !== 'undefined' ? BUILD_TIMESTAMP : 0,
      });
    });
  }
</script>

<style global lang="scss">
  @import 'styles/index.scss';
</style>

<svelte:head>
  <link href="https://fonts.googleapis.com/css?family=Space+Mono&display=swap" rel="stylesheet" />
  <meta name="theme-color" content="#000000" />
  <!-- Google Tag Manager, only for staging/production builds -->
  {#if allowGtm}
    <script>
      (function (w, d, s, l, i) {
        w[l] = w[l] || [];
        w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
        var f = d.getElementsByTagName(s)[0],
          j = d.createElement(s),
          dl = l != 'dataLayer' ? '&l=' + l : '';
        j.async = true;
        j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
        f.parentNode.insertBefore(j, f);
      })(window, document, 'script', 'dataLayer', 'GTM-WNQBCQ2');
    </script>
  {/if}
  <script>
    window.isUpdateAvailable = new Promise(function (resolve, reject) {
      if ('serviceWorker' in navigator) {
        console.log('registering ServiceWorker');
        window.addEventListener('load', function () {
          navigator.serviceWorker
            .register('/sw.js')
            .then(function (registration) {
              console.log('ServiceWorker registration successful with scope: ', registration.scope);
              registration.onupdatefound = function () {
                var installingWorker = registration.installing;
                installingWorker.onstatechange = function () {
                  switch (installingWorker.state) {
                    case 'installed':
                      if (navigator.serviceWorker.controller) {
                        resolve(registration);
                      } else {
                        resolve(false);
                      }
                      break;
                  }
                };
              };
            })
            .catch(function (err) {
              console.log('ServiceWorker registration failed: ', err);
              reject(err);
            });
        });
      }
    });
  </script>
</svelte:head>

<!-- Main app content -->
<Template>
  {#if pageScreen}
    <svelte:component this="{pageScreen}" />
  {:else if $wallet.status === 'Loading' || $claim.status === 'Loading'}
    <LoadingScreen />
  {:else if $preDungeonCheck.status === 'Loading'}
    <LoadingScreen />
  {:else if $wallet.status === 'NoWallet'}
    <DefaultScreen text="You need a wallet" />
  {:else if $wallet.status === 'Locked' || $wallet.status === 'Unlocking'}
    <DefaultScreen>
      <button disabled="{$wallet.status === 'Unlocking'}" on:click="{() => wallet.unlock()}">
        Connect Your Wallet
      </button>
    </DefaultScreen>
  {:else if $wallet.status === 'SettingUpWallet'}
    {#if $wallet.walletTakingTimeToReply}
      <DefaultScreen text="Please be patient, your wallet is getting set up..." />
    {:else}
      <DefaultScreen text="Please wait while your wallet gets set up..." />
    {/if}
  {:else if $claim.status === 'None' && $wallet.status === 'WalletToChoose'}
    <DefaultScreen text="Oh no. You don't have a key" askKey="true" signIn="true" />
  {:else if $claim.rawBalance && $claim.rawBalance.eq && $claim.rawBalance.eq(0)}
    <DefaultScreen text="The claim key ran out of ETH" askKey="true" signIn="true" />
  {:else}
    <GameScreen />
  {/if}
</Template>

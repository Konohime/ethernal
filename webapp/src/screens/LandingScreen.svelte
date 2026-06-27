<script>
  import wallet from 'stores/wallet';

  import BorderedContainer from 'components/BorderedContainer';
  import BoxButton from 'components/BoxButton';

  import IconSkull from 'assets/skull-key-white.png';
  import IconDiscord from 'assets/icons/discord_4x.png';

  $: connecting = $wallet.status === 'Unlocking';

  const connect = () => wallet.unlock();

  const features = [
    { icon: '⚔️', text: 'Real-time turn-based duels against on-chain monsters' },
    { icon: '🗝️', text: 'Explore a persistent, ever-expanding dungeon' },
    { icon: '💰', text: 'Loot, trade and own rooms — everything lives on-chain' },
  ];
</script>

<style lang="scss">
  @import '../styles/variables';

  .landing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: var(--window-height);
    max-width: 420px;
    margin: 0 auto;
    padding: 24px 16px;
    box-sizing: border-box;
    text-align: center;
  }

  .logo {
    width: 64px;
    height: auto;
    margin-bottom: 14px;
    animation: float 3.2s ease-in-out infinite;
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }

  .title {
    font-family: $heading-font-family;
    font-size: 34px;
    letter-spacing: 0.12em;
    margin: 0;
    color: $color-light;
  }

  .tagline {
    margin: 6px 0 22px;
    font-size: 13px;
    color: $color-xLightGrey;
    font-style: italic;
  }

  .panel {
    width: 100%;
  }

  .panel--inner {
    background: $color-dark;
    padding: 22px 20px 26px;
  }

  .features {
    list-style: none;
    margin: 0 0 22px;
    padding: 0;
    text-align: left;
  }

  .features li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    line-height: 1.4em;
    color: $color-xLightGrey;
    padding: 7px 0;
  }

  .features .ico {
    flex: 0 0 auto;
    font-size: 16px;
    line-height: 1.2em;
  }

  .cta {
    margin-top: 4px;
  }

  .hint {
    margin: 12px 0 0;
    font-size: 11px;
    color: $color-grey;
    line-height: 1.4em;
  }

  .social {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    margin-top: 22px;
  }

  .social a {
    display: inline-flex;
    align-items: center;
    opacity: 0.7;
    transition: opacity 0.15s ease-out;
    color: $color-xLightGrey;
    text-decoration: none;
    font-size: 12px;

    &:hover,
    &:focus {
      opacity: 1;
    }
  }

  .social img {
    width: 22px;
    height: 22px;
    filter: invert(1);
  }
</style>

<div class="landing">
  <img class="logo" src="{IconSkull}" alt="Ethernal" />
  <h1 class="title">Ethernal</h1>
  <p class="tagline">A fully on-chain dungeon crawler</p>

  <BorderedContainer class="panel">
    <div class="panel--inner">
      <ul class="features">
        {#each features as feature}
          <li>
            <span class="ico">{feature.icon}</span>
            <span>{feature.text}</span>
          </li>
        {/each}
      </ul>

      <div class="cta">
        <BoxButton type="wide full" isDisabled="{connecting}" onClick="{connect}">
          {#if connecting}Connecting...{:else}Connect Your Wallet{/if}
        </BoxButton>
      </div>

      <p class="hint">Connect a wallet to enter the dungeon. New here? You'll be guided through setup.</p>
    </div>
  </BorderedContainer>

  <div class="social">
    <a href="https://discord.gg/EwqKJVd" target="_blank" rel="noopener nofollow">
      <img src="{IconDiscord}" alt="Discord" />
    </a>
    <a href="https://twitter.com/EthernalWorld" target="_blank" rel="noopener nofollow">@EthernalWorld</a>
  </div>
</div>

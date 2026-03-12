<script>
  import { dungeon, map } from 'stores/dungeon';
  import { mapModal } from 'stores/screen';
  import { characterBalances } from 'lib/cache';
  import { pluralize } from 'utils/text';
  import { formatCoordinates } from 'utils/utils';

  import BoxButton from 'components/BoxButton';
  import ModalLayout from 'components/layouts/ModalLayout';
  import Resources from 'components/bag/Resources';

  export let coordinates;

  let error;
  let fragments;
  let loading = true;

  $: hasEnoughFragments = fragments !== null && fragments !== undefined && $characterBalances.fragments >= fragments;

  // Determine how much player can afford before calling move
  $: if ($dungeon && coordinates) {
    loading = true;
    error = null;
    $dungeon.discoveryCost(coordinates)
      .then(val => {
        // val === 0 means free (LOCATION_ZERO), val > 0 means cost in fragments
        fragments = (val !== null && val !== undefined && !val.error) ? Number(val) : null;
      })
      .catch(e => {
        // eslint-disable-next-line no-console
        console.error('discoveryCost failed:', e);
        fragments = null;
      })
      .finally(() => {
        loading = false;
      });
  }

  $: isDisabled = loading || !hasEnoughFragments;

  const onClick = async () => {
    error = null;
    try {
      await $map._move(coordinates);
      mapModal.close();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('room discovery failed:', err);
      error = 'Please try again.';
      if (err && err.reason === 'does not own enough') {
        error = 'Not enough fragments. Try again later.';
      } else if (err && err.reason) {
        error = err.reason;
      }
    }
  };
</script>

<style lang="scss">
  @import '../../../styles/variables';

  :global(.modal-layout.discover-room-screen) {
    @media screen and (min-width: $desktop-min-width) {
      max-width: 350px !important;
    }
  }

  p {
    flex: 1;
    width: 100%;
    text-align: center;
  }

  .button {
    padding: 8px 12px 0;
  }

  .error {
    padding-top: 4px;
    color: $color-highlight;
    font-weight: 700;
    text-align: center;
  }

  .res {
    color: $color-darker-text;
    font-size: 14px;
  }
</style>

<ModalLayout class="discover-room-screen">
  {#if loading}
    <p>...</p>
  {:else if fragments !== null && fragments !== undefined}
    {#if fragments === 0}
      <p>Free to generate room {formatCoordinates(coordinates)}</p>
    {:else}
      <p>{fragments} {pluralize('fragment', fragments)} to generate room {formatCoordinates(coordinates)}</p>
      {#if $characterBalances.fragments}
        <Resources fragments="{$characterBalances.fragments}" hideEmpty>
          <span class="res">You are carrying</span>
        </Resources>
      {:else}
        <span class="res">You don't have any fragments in your bag.</span>
      {/if}
    {/if}
  {:else}
    <p>Unable to load room cost. Please try again.</p>
  {/if}

  <div class="button">
    <BoxButton type="wide full" {isDisabled} {onClick} loadingText="Generating...">
      {#if loading}...{:else if !hasEnoughFragments && fragments > 0}Not enough fragments{:else}Generate room{/if}
    </BoxButton>
    {#if error}
      <p class="error">{error}</p>
    {/if}
  </div>
</ModalLayout>

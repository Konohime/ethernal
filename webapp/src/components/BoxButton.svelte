<script>
  import { needFood, currentDuel } from 'lib/cache';
  import { isMobile } from 'stores/screen';

  export let loadingText = null;
  export let isDisabled = false;
  export let type = 'primary';
  export let onClick;
  export let onMouseDown = null;
  export let onMouseUp = null;
  export let background = null;
  export let loadingForever = false;
  export let needsFood = false;
  export let notInDuel = false;

  let loading = false;

  const action = async fn => {
    if (onClick && !isDisabled) {
      loading = true;
      try {
        await fn();
      } finally {
        loading = false;
      }
      if (!loadingForever) {
        loading = false;
      }
    }
  };
</script>

<button
  class="btn {type}
  {$$props.class || ''}"
  disabled="{isDisabled || loading || (needsFood && $needFood) || (notInDuel && $currentDuel)}"
  style="background-color: {background}"
  on:click="{() => onClick && action(onClick)}"
  on:mousedown="{() => !$isMobile && onMouseDown && action(onMouseDown)}"
  on:mouseup="{() => !$isMobile && onMouseUp && action(onMouseUp)}"
  on:touchstart="{() => $isMobile && onMouseDown && action(onMouseDown)}"
  on:touchend="{() => $isMobile && onMouseUp && action(onMouseUp)}"
>
  {#if loading && loadingText}
    {loadingText}
  {:else}
    <slot />
  {/if}
</button>

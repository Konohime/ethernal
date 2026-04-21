<script>
  import { classPortrait } from 'utils/data';
  import { classes } from 'data/text';

  export let name;
  export let characterClass = '0';
  export let spriteId = null;

  const SPRITE_CDN = 'https://cb-media.sfo3.cdn.digitaloceanspaces.com/pixelbrokers/current/sprites';

  let useCustomSprite = false;
  let spriteIdInput = '';
  let spritePreviewUrl = '';
  let spriteError = false;

  function onSpriteIdInput() {
    spriteError = false;
    const id = parseInt(spriteIdInput, 10);
    if (!isNaN(id) && id >= 0 && id <= 9999) {
      spritePreviewUrl = `${SPRITE_CDN}/${id}.png`;
      spriteId = id;
    } else {
      spritePreviewUrl = '';
      spriteId = null;
    }
  }

  function onSpriteLoadError() {
    spriteError = true;
    spriteId = null;
  }

  function toggleCustomSprite(enabled) {
    useCustomSprite = enabled;
    if (!enabled) {
      spriteId = null;
      spriteIdInput = '';
      spritePreviewUrl = '';
      spriteError = false;
    }
  }

  $: text = classes[characterClass];
</script>

<style lang="scss">
  @import '../styles/variables';

  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0 4px;
  }
  .container {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    margin-left: 20px;
    margin-right: 20px;
  }
  .selection-box {
    cursor: pointer;
    display: block;
    text-align: center;
    transition: opacity 0.1s ease-in-out;

    input {
      display: none;
    }
    img {
      border: 1px solid $color-grey;
      padding: 2px;
    }

    &.disabled {
      opacity: 0.24;

      &:hover {
        opacity: 0.64;
      }
    }
  }
  img {
    width: 46px;
    height: 46px;
  }
  h3 {
    margin: 0;
  }
  .input-container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;

    label {
      font-size: 12px;
    }
  }
  input {
    margin-top: 4px;
    border: 3px solid $color-grey;
    background: transparent;
    color: $color-light;
    outline: none;
  }
  input:focus {
    border-color: $color-light;
  }
  .description {
    flex-direction: column;
    border: 1px solid $color-grey;
    justify-content: start;
    text-align: left;
    padding: 10px;
    min-height: 80px;

    ul {
      margin-left: 25px;
    }
  }
  .sprite-section {
    h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }
  }
  .sprite-toggle {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    justify-content: center;
  }
  .sprite-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .sprite-option {
    cursor: pointer;
    padding: 6px 12px;
    border: 1px solid $color-grey;
    font-size: 11px;
    transition: border-color 0.15s;

    input {
      display: none;
    }
    &.active {
      border-color: $color-light;
      color: $color-light;
    }
  }
  .sprite-input-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;

    label {
      font-size: 11px;
    }
    input {
      width: 90px;
      text-align: center;
      border: 2px solid $color-grey;
      background: transparent;
      color: $color-light;
      outline: none;

      &:focus {
        border-color: $color-light;
      }
    }
  }
  .sprite-preview {
    text-align: center;

    img {
      width: 64px;
      height: auto;
      image-rendering: pixelated;
      border: 1px solid $color-grey;
      padding: 2px;
    }
  }
  .sprite-error {
    color: #ff4848;
    font-size: 11px;
    text-align: center;
  }
</style>

<div class="form">
  <div class="input-container">
    <label>Name your character</label>
    <input maxlength="19" type="text" placeholder="..." bind:value="{name}" />
  </div>

  <h3>Select a class</h3>
  <div class="container">
    <label class:disabled="{characterClass !== '0'}" class="selection-box">
      <input type="radio" bind:group="{characterClass}" value="{'0'}" />
      <img src="{classPortrait('0')}" alt="{classes['0'][0]}" />
    </label>
    <label class:disabled="{characterClass !== '1'}" class="selection-box">
      <input type="radio" bind:group="{characterClass}" value="{'1'}" />
      <img src="{classPortrait('1')}" alt="{classes['1'][0]}" />
    </label>
    <label class:disabled="{characterClass !== '2'}" class="selection-box">
      <input type="radio" bind:group="{characterClass}" value="{'2'}" />
      <img src="{classPortrait('2')}" alt="{classes['2'][0]}" />
    </label>
    <label class:disabled="{characterClass !== '3'}" class="selection-box">
      <input type="radio" bind:group="{characterClass}" value="{'3'}" />
      <img src="{classPortrait('3')}" alt="{classes['3'][0]}" />
    </label>
  </div>
  <div class="container description">
    <div>
      <h4>{text[0]}</h4>
      <ul>
        {#each text[1] as desc}
          <li>{desc}</li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="sprite-section">
    <div class="sprite-toggle">
      <label class="sprite-option" class:active="{!useCustomSprite}">
        <input type="radio" name="spriteMode" checked="{!useCustomSprite}" on:change="{() => toggleCustomSprite(false)}" />
        Default sprite
      </label>
      <label class="sprite-option" class:active="{useCustomSprite}">
        <input type="radio" name="spriteMode" checked="{useCustomSprite}" on:change="{() => toggleCustomSprite(true)}" />
        PixelBroker
      </label>
    </div>

    {#if useCustomSprite}
      <div class="sprite-body">
        <div class="sprite-input-row">
          <label>Sprite ID</label>
          <input
            type="number"
            min="0"
            max="9999"
            placeholder="0–9999"
            bind:value="{spriteIdInput}"
            on:input="{onSpriteIdInput}"
          />
        </div>
        {#if spritePreviewUrl && !spriteError}
          <div class="sprite-preview">
            <img src="{spritePreviewUrl}" alt="Sprite #{spriteIdInput}" on:error="{onSpriteLoadError}" />
          </div>
        {/if}
        {#if spriteError}
          <p class="sprite-error">Sprite not found</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

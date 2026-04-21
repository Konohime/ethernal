<script>
  import { classPortrait } from 'utils/data';
  import { classes } from 'data/text';

  export let name;
  export let characterClass = '0';
  export let spriteId = null;

  let useCustomSprite = false;
  let spriteIdInput = '';

  function onSpriteIdInput() {
    const id = parseInt(spriteIdInput, 10);
    spriteId = !isNaN(id) && id >= 0 && id <= 9999 ? id : null;
  }

  function toggleCustomSprite(enabled) {
    useCustomSprite = enabled;
    if (!enabled) {
      spriteId = null;
      spriteIdInput = '';
    }
  }

  $: text = classes[characterClass];
</script>

<style lang="scss">
  @import '../styles/variables';

  .form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;
    font-size: 11px;
  }
  .container {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    margin: 0 16px;
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
      padding: 1px;
    }

    &.disabled {
      opacity: 0.24;

      &:hover {
        opacity: 0.64;
      }
    }
  }
  img {
    width: 36px;
    height: 36px;
  }
  h3 {
    margin: 0;
    font-size: 13px;
  }
  .input-container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;

    label {
      font-size: 11px;
    }
  }
  input {
    margin-top: 2px;
    border: 2px solid $color-grey;
    background: transparent;
    color: $color-light;
    outline: none;
    font-size: 12px;
    padding: 4px 6px;
  }
  input:focus {
    border-color: $color-light;
  }
  .description {
    flex-direction: column;
    border: 1px solid $color-grey;
    justify-content: start;
    text-align: left;
    padding: 6px 10px;
    min-height: 60px;
    font-size: 11px;

    h4 { margin: 0 0 2px; font-size: 11px; }
    ul {
      margin: 0 0 0 18px;
      padding: 0;
    }
    li { line-height: 1.3; }
  }
  .sprite-toggle {
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: center;
  }
  .sprite-id-input {
    width: 70px;
    padding: 4px 6px;
    margin: 0;
    text-align: center;
    border: 1px solid $color-grey;
    background: transparent;
    color: $color-light;
    outline: none;
    font-size: 11px;

    &:focus {
      border-color: $color-light;
    }
  }
  .sprite-option {
    cursor: pointer;
    padding: 4px 10px;
    border: 1px solid $color-grey;
    font-size: 10px;
    transition: border-color 0.15s;

    input {
      display: none;
    }
    &.active {
      border-color: $color-light;
      color: $color-light;
    }
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

  <div class="sprite-toggle">
    <label class="sprite-option" class:active="{!useCustomSprite}">
      <input type="radio" name="spriteMode" checked="{!useCustomSprite}" on:change="{() => toggleCustomSprite(false)}" />
      Default sprite
    </label>
    <label class="sprite-option" class:active="{useCustomSprite}">
      <input type="radio" name="spriteMode" checked="{useCustomSprite}" on:change="{() => toggleCustomSprite(true)}" />
      PixelBroker
    </label>
    {#if useCustomSprite}
      <input
        class="sprite-id-input"
        type="number"
        min="0"
        max="9999"
        placeholder="0–9999"
        bind:value="{spriteIdInput}"
        on:input="{onSpriteIdInput}"
      />
    {/if}
  </div>
</div>

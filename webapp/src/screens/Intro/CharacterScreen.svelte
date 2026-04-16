<script>
  import { classes } from 'data/text';
  import characterChoice from 'stores/characterChoice';

  import DefaultScreen from 'screens/DefaultScreen';
  import SelectCharacterClass from 'components/SelectCharacterClass';

  export let next;

  let name;
  let characterClass = '0';
  let spriteId = null;
  $: text = classes[characterClass];
</script>

<DefaultScreen
  header="logo"
  btnText="Go forth"
  btnPressed="{() => {
    if (name && name !== '') {
      characterChoice.setData({ name, characterClass, spriteId });
      next();
    }
  }}"
  btnDisabled="{!(name && name !== '')}"
>
  <SelectCharacterClass bind:characterClass bind:name bind:spriteId />
</DefaultScreen>

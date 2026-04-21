<script>
  import { classPortrait } from 'utils/data';

  import preDungeonCheck from 'stores/preDungeonCheck';
  import DefaultScreen from 'screens/DefaultScreen';
  import BoxButton from 'components/BoxButton';

  const { characterInfo: rawInfo, refill, ressurectedId } = $preDungeonCheck;
  const characterInfo = {
    characterName: (rawInfo && rawInfo.characterName) || 'Adventurer',
    stats: (rawInfo && rawInfo.stats) || { characterClass: 0 },
    status: (rawInfo && rawInfo.status) || { status: 'alive' },
  };

  let disabled = false;
  const ok = async () => {
    try {
      disabled = true;
      if (ressurectedId) {
        await preDungeonCheck.enter({ ressurectedId, characterInfo });
      } else {
        await preDungeonCheck.checkBackIn(refill);
      }
    } catch (e) {
      disabled = false;
    }
  };
</script>

<style lang="scss">
  @import '../../styles/variables';

  .content {
    height: 100%;
  }
  img {
    border: 1px solid $color-grey;
    padding: 2px;
    margin: 0 0 5px 0;
    width: 80px;
    height: 80px;
  }
  .content h3 {
    font-size: 20px;
  }
  .explain {
    font-size: 11px;
    font-style: italic;
    color: $color-lightGrey;
    padding: 12px 16px 0;
    line-height: 1.5;
  }
</style>

<DefaultScreen>
  <div class="content as-space-between">

    <h2>Your Character</h2>
    <div>
      <img src="{classPortrait(characterInfo.stats.characterClass)}" alt="" />
      <h3>{characterInfo.characterName}</h3>
    </div>
    {#if ressurectedId}
      <p>is waiting for you at dungeon entrance.</p>
      <p class="explain">
        This transaction re-enters your resurrected character into the dungeon.
        No ETH is spent — only a signature and gas.
      </p>
    {:else}
      <p>is waiting for you in the dungeon.</p>
      <p class="explain">
        This single transaction reconnects your character and tops up the energy
        needed to play (moves, combat, etc.). Your game actions after this are
        free — they're signed silently by a temporary delegate key.
      </p>
    {/if}

    <div>
      <BoxButton type="wide full" {disabled} onClick="{ok}">
        {#if ressurectedId}Enter the dungeon{:else}Sign Back In{/if}
      </BoxButton>
    </div>
  </div>
</DefaultScreen>

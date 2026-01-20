<script>
  import { onMount, onDestroy } from 'svelte';
  import * as Sentry from '@sentry/browser';
  import { characterFeatures } from 'lib/cache';
  import nprogress from 'nprogress';
  import router from 'page';
  
  // Import PIXI from compatibility layer
  import PIXI, { Stage } from 'lib/pixi-compat';
  import { Viewport } from 'pixi-viewport';

  import log from 'utils/log';
  import { menuOverlay, notificationOverlay } from 'stores/screen';
  import { dungeon, map as mapStore } from 'stores/dungeon';
  import { currentRoom, characterStatus, currentFloor } from 'lib/cache';
  import { getAreaByType } from 'data/elements';

  import MapRenderer from 'canvas/map/render/MapRenderer';
  import { MAX_FPS } from 'canvas/common/Utils';
  import MapUpdates from 'canvas/map/MapUpdates';
  import UI from 'canvas/map/UI';

  import BoxButton from 'components/BoxButton';
  import MiniMap from 'components/map/MiniMap';

  import IconHere from 'assets/icons/marker_2x.png';
  import IconMinimap from 'assets/icons/minimap_4x.png';
  import IconLoading from 'assets/icons/loading_2x.png';
  import IconClose from 'assets/close.png';

  export let hidden;

  let app;
  let container;
  let _w;
  let _h;
  let ui;
  let map;
  let mapViewport;
  let mapUpdates;
  let mapNavEnabled = false;
  let expandMiniMap = false;
  let roomCoordinates;
  let assetsLoaded = false;

  $: area = getAreaByType($currentRoom.areaType);

  /** Route handler */
  let startingCoordinates;
  router('/room/:coords', ({ params }) => {
    const { coords } = params;
    if (!map || !assetsLoaded) {
      startingCoordinates = coords;
    } else {
      map.refocus(coords);
    }
  });
  router.start();

  /** Asset loading with PIXI 7 Assets API */
  const loadAssets = async () => {
    nprogress.start();
    
    const assets = [
      { alias: 'icon_def', src: '/images/ui/icon_def.png' },
      { alias: 'icon_select_atk', src: '/images/ui/attackSelectIcon.png' },
      { alias: 'icon_select_def', src: '/images/ui/defenseSelectIcon.png' },
      
      // UI icons for modifier stats
      { alias: 'modifier_icon_armor_s', src: '/images/ui/modifier/icon_armor_s.png' },
      { alias: 'modifier_icon_atk_s', src: '/images/ui/modifier/icon_atk_s.png' },
      { alias: 'modifier_icon_def_s', src: '/images/ui/modifier/icon_def_s.png' },
      { alias: 'modifier_icon_dmg_s', src: '/images/ui/modifier/icon_dmg_s.png' },
      { alias: 'modifier_icon_hp_s', src: '/images/ui/modifier/icon_hp_s.png' },
      { alias: 'icon_armor_s', src: '/images/ui/icon_armor_s.png' },
      
      // Portraits
      { alias: 'portrait_adv', src: '/images/ui/portraits/port_adv_6x.png' },
      { alias: 'portrait_bar', src: '/images/ui/portraits/port_bar_6x.png' },
      { alias: 'portrait_war', src: '/images/ui/portraits/port_war_6x.png' },
      { alias: 'portrait_wiz', src: '/images/ui/portraits/port_wiz_6x.png' },
      
      // More icons
      { alias: 'icon_atk_s', src: '/images/ui/icon_atk_s.png' },
      { alias: 'icon_def_s', src: '/images/ui/icon_def_s.png' },
      { alias: 'icon_dmg_s', src: '/images/ui/icon_dmg_s.png' },
      { alias: 'icon_hp_s', src: '/images/ui/icon_hp_s.png' },
      
      // UI icons for combat cards
      { alias: 'icon_action_armor', src: '/images/ui/icon_action_armor.png' },
      { alias: 'icon_action_atk', src: '/images/ui/icon_action_atk.png' },
      { alias: 'icon_action_def', src: '/images/ui/icon_action_def.png' },
      { alias: 'icon_action_dmg', src: '/images/ui/icon_action_dmg.png' },
      { alias: 'icon_action_hp', src: '/images/ui/icon_action_hp.png' },
      
      // Spritesheets (JSON with textures)
      { alias: 'fx_curses', src: `/images/fx_curses.json?${COMMIT}` },
      { alias: 'character_classes', src: `/images/map/character_classes.json?${COMMIT}` },
      
      // Map assets
      { alias: 'arrows', src: '/images/map/arrows.png' },
      { alias: 'path', src: '/images/map/path.png' },
      { alias: 'tilemaps', src: `/images/map/tilemaps.json?${COMMIT}` },
      { alias: 'sheet', src: `/images/pixi-art.json?${COMMIT}` },
      
      // Radial menu icons
      { alias: 'icon_box_02', src: '/images/ui/icons/interaction/box02_36x36.png' },
      { alias: 'help_icon_16', src: '/images/ui/icons/interaction/help_16x16.png' },
      { alias: 'chat_icon_16', src: '/images/ui/icons/interaction/chat_16x16.png' },
      { alias: 'mail_icon_16', src: '/images/ui/icons/interaction/mail_16x16.png' },
      { alias: 'trade_icon_16', src: '/images/ui/icons/interaction/trade_16x16.png' },
      { alias: 'party_icon_16', src: '/images/ui/icons/interaction/party_16x16.png' },
      { alias: 'guild_icon_16', src: '/images/ui/icons/interaction/guild02_16x16.png' },
    ];
    
    // Add all assets to the bundle
    for (const asset of assets) {
      PIXI.Assets.add(asset);
    }
    
    // Load all assets with progress tracking
    try {
      await PIXI.Assets.load(
        assets.map(a => a.alias),
        (progress) => {
          log.debug(`${Math.round(progress * 100)}% loaded`);
          nprogress.set(progress);
        }
      );
      
      assetsLoaded = true;
      nprogress.done();
      log.debug('All assets loaded');
      
      // Initialize the map
      init();
    } catch (err) {
      log.error('Asset loading error:', err);
      nprogress.done();
      Sentry.captureException(err);
    }
  };

  const resize = () => {
    if (!container || !mapViewport || !app) return;
    _w = container.clientWidth;
    _h = container.clientHeight;
    mapViewport.resize(_w, _h);
    app.renderer.resize(_w, _h);
  };

  /** Page init */
  const init = async () => {
    if (map != null || !assetsLoaded) {
      return;
    }

    ui = new UI(mapViewport, $dungeon.cache, app);

    if (map == null) {
      map = new MapRenderer(mapViewport, app, ui);
      globalThis.map = map;
      map.init();
      app.ticker.add(() => {
        map.onUpdate();
        map.onPostUpdate();
      });
    }

    mapUpdates = new MapUpdates($dungeon.cache, map);
    await mapUpdates.init(startingCoordinates);
    mapStore.set(map);

    mapNavEnabled = true;
  };

  /** Page mount */
  onMount(() => {
    // Load Google fonts
    window.WebFontConfig = {
      google: {
        families: ['Space Mono', 'VT323'],
      },
      active() {
        loadAssets();
      },
    };

    // Load web-font loader script
    const wf = document.createElement('script');
    wf.src = 'https://ajax.googleapis.com/ajax/libs/webfont/1/webfont.js';
    wf.type = 'text/javascript';
    wf.async = true;
    document.head.appendChild(wf);

    _w = container.clientWidth;
    _h = container.clientHeight;

    // Ensure even dimensions
    if (_w % 2 !== 0) _w -= 1;
    if (_h % 2 !== 0) _h -= 1;

    // Configure tilemap settings (PIXI 7)
    if (PIXI.tilemap && PIXI.tilemap.settings) {
      PIXI.tilemap.settings.maxTextures = 4;
    }

    try {
      // Create PIXI Application (PIXI 7 style)
      app = new PIXI.Application({
        width: _w,
        height: _h,
        resolution: window.devicePixelRatio,
        autoDensity: true,
        backgroundColor: 0x000000,
        antialias: false,
      });

      // Set default scale mode
      PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

      app.ticker.maxFPS = MAX_FPS;
      
      // Use Stage from @pixi/layers
      app.stage = new Stage();
      app.stage.sortableChildren = true;

      // Create Viewport (pixi-viewport 5.x is compatible with PIXI 7)
      mapViewport = new Viewport({
        screenWidth: _w,
        screenHeight: _h,
        worldWidth: _w,
        worldHeight: _h,
        events: app.renderer.events, // PIXI 7 uses events instead of interaction
      });
      
      app.stage.addChild(mapViewport);
      mapViewport
        .drag()
        .wheel()
        .decelerate()
        .clampZoom({ minWidth: _w / 3, minHeight: _h / 3, maxWidth: _w * 3, maxHeight: _h * 3 });

      container.appendChild(app.canvas); // PIXI 7 uses app.canvas instead of app.view

      // Make responsive
      window.addEventListener('resize', resize);
    } catch (err) {
      if (/WebGL unsupported in this browser/.test(err.message)) {
        notificationOverlay.open('generic', {
          class: 'error',
          text: 'Ethernal requires a hardware accelerated WebGL-enabled device to play.',
          closeable: false
        });
      }
      Sentry.captureException(err);
    }
  });

  onDestroy(() => {
    window.removeEventListener('resize', resize);
    if (app) {
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    }
  });

  const toggleMiniMap = () => {
    expandMiniMap = !expandMiniMap;
  };

  const onRoomClick = coordinates => {
    menuOverlay.open('roomInfo', { coordinates });
  };
</script>

<style lang="scss">
  @import '../../styles/variables';

  @keyframes rotate {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(-360deg);
    }
  }

  .map-area {
    position: relative;
    width: 100%;
    height: 100%;

    &--loading {
      pointer-events: none;
      position: absolute;
      top: calc(50% - #{$header-height});
      left: 0;
      right: 0;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.12s ease-out;
      text-align: center;
      font-size: 12px;

      img {
        width: auto;
        height: 2em;
      }

      .is-loading & {
        opacity: 0.48;

        img {
          animation: rotate 1s infinite;
          transform-origin: center center;
        }
      }
    }

    &--canvas {
      width: 100%;
      height: 100%;
    }

    &--footer {
      pointer-events: none;
      display: flex;
      position: absolute;
      bottom: 0;
      right: 0;
      left: 0;
      z-index: 10;
      justify-content: stretch;
      align-items: flex-end;
      padding: 20px 12px 0px 12px;
      background: linear-gradient(to top, rgba($color-black, 0.8), rgba($color-black, 0.8) 90%, transparent);

      @media screen and (min-width: $desktop-min-width) {
        height: 40px;
        padding: 24px 0 16px 24px;
      }

      h3,
      a {
        cursor: pointer;
        pointer-events: all;
        color: currentColor;
        transition: opacity 0.2s ease-in-out;

        &:hover {
          opacity: 0.64;
        }
      }

      h4 a {
        text-decoration: underline;
      }
    }

    .right {
      display: inline-flex;
      flex-shrink: 0;
      margin-left: 12px;

      @media screen and (min-width: $desktop-min-width) {
        min-height: 48px;
      }

      :global(button) {
        margin-left: 8px;

        @media screen and (min-width: $desktop-min-width) {
          margin-left: 10px;
        }
      }
    }

    .left {
      display: inline-flex;
      flex: 1;
    }

    .icon {
      line-height: 1em;

      img {
        display: inline-block;
        width: 60%;
        height: auto;
        vertical-align: middle;
      }
    }

    .gameover {
      width: 100%;
      max-width: $desktop-menu-width;
      margin: 0 auto;
      text-align: center;

      @media screen and (max-width: $mobile-max-width) {
        padding-top: 50px;
      }
    }

    .room-title {
      padding-top: 0px;
      margin-left: 8px;

      h3 {
        .underline {
          text-decoration: underline;
          text-decoration-color: rgba($color-light, 0.42);
          text-underline-position: under;
        }
      }

      @media screen and (min-width: $desktop-min-width) {
        margin-left: 10px;
      }

      @media screen and (max-width: $mobile-max-width) {
        h3 {
          font-size: 12px;
        }
        h4 {
          font-size: 10px;
        }
      }
    }

    .area-name {
      margin: 1px 0 5px 10px;
      font-size: 13px;

      @media screen and (max-width: $mobile-max-width) {
        font-size: 10px;
      }
    }

    .area-info {
      flex-direction: column;
      text-align: right;
      display: flex;
      color: $color-lightGrey;
      text-transform: uppercase;

      @media screen and (max-width: $mobile-max-width) {
        h4 {
          font-size: 10px;
        }
      }
    }

    .area-color {
      display: inline-block;
      width: 8px;
      height: 8px;
    }

    .lighter {
      color: $color-lightGrey;
    }
  }

  .minimap {
    position: absolute;
    bottom: 58px;
    right: 0;
    z-index: 15;

    @media screen and (max-width: $mobile-max-width) {
      top: -$mobile-menu-height;
      left: 0;
      right: 0;
    }

    @media screen and (min-width: $desktop-min-width) {
      bottom: 88px;
      max-width: 290px;
      max-height: 260px;
      min-width: 50px;
      min-height: 50px;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(255, 255, 255, 0.18);
    }
  }
</style>

<div class="map-area {$$props.class || ''} {mapNavEnabled ? '' : 'is-loading'} {hidden ? 'canvas-hidden' : ''}">
  <div class="map-area--loading">
    <img src="{IconLoading}" alt="loading..." />
  </div>

  <div class="map-area--canvas" bind:this="{container}"></div>

  {#if expandMiniMap}
    <div class="minimap">
      <MiniMap enabled="{mapNavEnabled}" toggleMap="{() => toggleMiniMap()}" />
    </div>
  {/if}

  <div class="map-area--footer">
    {#if $characterStatus === 'dead'}
      <div class="gameover">
        {#if $menuOverlay.screen !== 'rebirth'}
          <BoxButton type="wide full" onClick="{() => menuOverlay.open('rebirth')}">Create a new character</BoxButton>
        {/if}
      </div>
    {:else}
      <div class="left">
        <BoxButton type="secondary map-footer-icon" onClick="{() => map && map.refocus()}">
          <span class="icon">
            <img src="{IconHere}" alt="here" />
          </span>
        </BoxButton>
        <div class="room-title">
          <h3 on:click="{() => onRoomClick($currentRoom.coordinates)}">
            <span class="underline">{$currentRoom.customName || $currentRoom.name}</span>
            <span class="lighter">{$currentRoom.formattedCoordinates}</span>
          </h3>
          <h4>
            Room Block
            <a href="{BLOCK_EXPLORER_URL}/{$currentRoom.blockNumber}" rel="noopener nofollow" target="_blank">
              #{Number($currentRoom.blockNumber)}
            </a>
          </h4>
        </div>
      </div>

      <div class="right">
        <div class="area-info">
          {#if area}
            <div class="area-name">
              <div
                class="area-color"
                style="{`background-color: #${(area.color && area.color.toString(16)) || '979797'};`}"
              ></div>
              {area.key || ''} Area
            </div>
          {/if}
          <h4>Floor {$currentFloor}</h4>
        </div>

        {#if $characterFeatures.minimap}
          <BoxButton
            type="secondary map-footer-icon"
            class="{expandMiniMap ? 'highlight' : ''}"
            onClick="{() => toggleMiniMap()}"
          >
            {#if expandMiniMap}
              <span class="icon">
                <img src="{IconClose}" alt="minimap" />
              </span>
            {:else}
              <span class="icon">
                <img src="{IconMinimap}" alt="minimap" />
              </span>
            {/if}
          </BoxButton>
        {/if}
      </div>
    {/if}
  </div>
</div>

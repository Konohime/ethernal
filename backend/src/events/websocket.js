const ethers = require('ethers');
const Events = require('./events');

// Le provider pousse les blocs/logs via eth_subscribe : plus de polling
// eth_getBlockByNumber toutes les 3s ni de eth_getLogs par bloc et par contrat.
// On garde le provider HTTP (passé au constructeur) pour les eth_call / tx /
// replay ; le WebSocket ne sert qu'aux souscriptions temps-réel.
//
// ethers v5 WebSocketProvider ne se reconnecte pas tout seul et ne détecte pas
// les sockets morts (le serveur peut couper sans frame `close`). On ajoute donc
// un ping applicatif + une recréation complète du provider avec re-souscription
// de tous les filtres enregistrés.
const PING_INTERVAL = 15000; // on ping le serveur toutes les 15s
const PING_TIMEOUT = 10000; // pas de pong sous 10s => socket considéré mort
const RECONNECT_DELAY = 2000; // backoff avant reconnexion

class WebSocketEvents extends Events {
  constructor(provider, db, url) {
    super(provider, db);
    this.url = url;
    // On mémorise les souscriptions pour pouvoir les ré-attacher après reconnexion.
    this.blockCallbacks = [];
    this.logSubscriptions = [];
    console.log('listening for events with websocket ' + url);
    this.connect();
  }

  connect() {
    this.wsProvider = new ethers.providers.WebSocketProvider(this.url);
    const ws = this.wsProvider._websocket;

    let pongTimeout;
    this.keepalive = setInterval(() => {
      ws.ping();
      pongTimeout = setTimeout(() => ws.terminate(), PING_TIMEOUT);
    }, PING_INTERVAL);
    ws.on('pong', () => clearTimeout(pongTimeout));

    ws.on('close', code => {
      console.log('websocket closed (' + code + '), reconnecting in ' + RECONNECT_DELAY + 'ms');
      clearInterval(this.keepalive);
      clearTimeout(pongTimeout);
      setTimeout(() => this.connect(), RECONNECT_DELAY);
    });
    ws.on('error', err => console.log('websocket error: ' + err.message));

    // Ré-attache les filtres déjà enregistrés (cas reconnexion ; au premier
    // démarrage ces tableaux sont vides car les modules de jeu appellent
    // `.on()`/`.onBlock()` après la construction).
    this.blockCallbacks.forEach(callback => this.wsProvider.on('block', callback));
    this.logSubscriptions.forEach(sub => this.subscribeLog(sub));
  }

  subscribeLog(sub) {
    const { contract, eventName, callback, prefetch } = sub;
    const filter = {
      address: contract.address,
      topics: [contract.interface.getEventTopic(eventName)],
    };
    this.wsProvider.on(filter, async log => {
      const event = this.parseLog(contract, log);
      // log.removed === true lors d'un reorg (équivalent du logsRemoved du streamer).
      await this.useDeferrableCallback(callback, prefetch)(...Array.from(event.args), event, !!log.removed);
    });
  }

  onBlock(callback) {
    this.blockCallbacks.push(callback);
    if (this.wsProvider) {
      this.wsProvider.on('block', callback);
    }
    return this;
  }

  on(contract, eventName, callback, prefetch, confirmed = false) {
    super.on(contract, eventName, callback, prefetch, confirmed);
    const sub = { contract, eventName, callback, prefetch };
    this.logSubscriptions.push(sub);
    if (this.wsProvider) {
      this.subscribeLog(sub);
    }
    return this;
  }
}

module.exports = WebSocketEvents;

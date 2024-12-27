const { EventEmitter } = require('events');
const sha1 = require('sha1');
const WebSocket = require('ws');

class Socket extends EventEmitter {
  /**
   * Set the param so VSCode understands.
   * @param {WebSocket} ws
   */
  constructor(server, ws, req) {
    super();
    this.server = server;
    this.ws = ws;
    this.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    this.id = sha1(this.ip + Date.now() + Math.random()).substring(0, 20);
    this.ipBasedId = sha1(this.ip).substring(0, 20);
    this.isAlive = true;
    this.isConnected = true;
    this.connectionTime = Date.now();
    this.bindEvents();
    this.bindEventListeners();
    this.debug('New Socket Constructed with ID: ' + this.id);
  }
  bindEvents() {
    const self = this;
    const oldEmit = this.ws.emit;
    this.ws.emit = function onEmit() {
      self.emit(arguments[0], arguments[1]);
      oldEmit.apply(self.ws, arguments);
    };
  }
  bindEventListeners() {
    this.on('error', e => {
      this.debugErr(e);
      this.close();
    });
    this.on('message', raw => {
      let d;
      try {
        d = JSON.parse(raw);
      } catch (e) {
        return 'Invalid Request';
      }
      if (!Array.isArray(d)) return this.server.handleData(this, d);
      for (let i = 0; i < d.length; i++) {
        this.server.handleData(this, d[i]);
      }
    });
    this.on('pong', () => {
      this.heartbeat();
    });
    this.on('close', () => {
      this.close();
    });
  }
  send(raw, cb) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(raw, cb);
  }
  sendArray(arr, cb) {
    this.send(JSON.stringify(arr), cb);
  }
  sendObject(obj, cb) {
    this.sendArray([obj], cb);
  }
  debug(args) {
    console.log(`[${this.id.substring(0, 5)}] ${args}`);
  }
  debugErr(args) {
    console.error(`[${this.id.substring(0, 5)}] ${args}`);
  }
  close() {
    this.debug('Connection Closed');
    this.isConnected = false;
    const p = this.server.participants.get(this.ipBasedId);
    if (p) {
      const activeSockets = Array.from(this.server.sockets).filter(s => 
        s.ipBasedId === this.ipBasedId && s.isConnected && s.id !== this.id
      );
      
      if (activeSockets.length === 0) {
        p.isConnected = false;
        p.lastSeen = Date.now();
      }
    }

    this.server.rooms.forEach(r => {
      const pR = r.findParticipant(this.id);
      if (pR) {
        r.removeParticipant(this.id);
        r.count = r.ppl.length;
      }
    });

    this.server.cleanupParticipants();
  }
  ping(noop) {
    return this.ws.ping(noop);
  }
  // Broken Connections
  heartbeat() {
    this.isAlive = true;
  }
}

module.exports = Socket;
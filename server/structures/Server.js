const CLI = require('./CLI.js');
const Participant = require('./Participant.js');
const Room = require('./Room.js');
const Socket = require('./Socket.js');
// const { WebhookClient } = require('discord.js');
const WebSocket = require('ws');
// const webhook = new WebhookClient('418653029546328064', 'EhMWO3en6RjzRbGL-RkZfPfaFYxaN0XEumi7eRJKqZ60pDIDk1WzoKdxD6Xolkd25hOw', { disableEveryone: true });

class Server extends WebSocket.Server {
  constructor() {
    super({ noServer: true });
    this.cli = new CLI(this);
    console.log('Server Launched');
    this.sockets = new Set();
    this.participants = new Map();
    this.rooms = new Map();
    this.bindEventListeners();
    // Broken Connections
    setInterval(() => {
      this.sockets.forEach(s => {
        if (s.isAlive == false) return s.ws.terminate();
        s.isAlive = false;
        s.ping(() => {}); // eslint-disable-line no-empty-function
      });
    }, 30000);
  }
  removeTextHell(text) {
    return text.replace(/[^\w\s`1234567890\-=~!@#$%^&*()_+,.\/<>?\[\]\\\{}|;':"]/g, '');
  }
  bindEventListeners() {
    this.on('connection', (ws, req) => {
      this.sockets.add(new Socket(this, ws, req));
    });
  }
  broadcast(item, ignore = []) {
    this.sockets.forEach(s => {
      if (ignore.includes(s.id)) return;
      if (Array.isArray(item)) return s.sendArray(item);
      else return s.sendObject(item);
    });
  }
  broadcastTo(item, ppl, ignore = []) {
    this.sockets.forEach(s => {
      if (!ppl.includes(s.id) || ignore.includes(s.id)) return;
      if (Array.isArray(item)) return s.sendArray(item);
      else return s.sendObject(item);
    });
  }
  // EVENT TIME!
  handleData(s, data) {
    if (Array.isArray(data) || !data.hasOwnProperty('m')) return;
    if (!['t', 'm', 'n'].includes(data.m)) console.log(data);
    if (data.m == 'hi') {
      let p;
      // First try to find an existing participant by IP-based ID
      this.participants.forEach((participant, id) => {
        if (participant._id === s.ipBasedId) {
          p = participant;
        }
      });

      // If no participant found, create a new one with IP-based ID
      if (!p) {
        p = this.newParticipant(s);
      } else {
        // Update the socket ID but keep the IP-based ID
        p._id = s.ipBasedId;
        this.participants.set(s.ipBasedId, p);
      }

      return s.sendObject({
        m: 'hi',
        u: p.generateJSON(),
        t: Date.now()
      });
    }
    if (data.m == 'ch') {
      const p = this.getParticipant(s);
      if (!p) return;
      // Old Room
      const old = this.getRoom(p.room);
      if (old) {
        old.removeParticipant(p._id);
        if (old.count <= 0) this.rooms.delete(p.room);
      }
      // New Room
      let r = this.getRoom(data._id);
      if (!r) {
        r = this.newRoom(data, p);
        // Only set crown for new rooms
        if (!r.settings.lobby) {
          r.crown = {
            participantId: r.findParticipant(p._id).id,
            userId: p._id,
            time: Date.now()
          };
        }
      }
      let pR = r.findParticipant(p._id);
      if (!pR) pR = r.newParticipant(p);
      p.room = r._id;

      // Send room info to all participants
      const roomInfo = {
        m: 'ch',
        ch: r.generateJSON(),
        p: pR.id,
        ppl: r.ppl.length > 0 ? r.ppl : null
      };

      // Broadcast room update to all participants
      this.broadcastTo(roomInfo, r.ppl.map(tpR => tpR._id));

      return s.sendObject(roomInfo);
    }
    if (data.m == 'chset') {
      const p = this.getParticipant(s);
      if (!p) return;
      const r = this.getRoom(p.room);
      if (!r) return;
      // Only allow crown holder to change settings
      if (!r.crown || r.crown.userId !== p._id) return;
      
      r.update(data.set);
      // Broadcast the updated settings to all participants
      const roomInfo = {
        m: 'ch',
        ch: r.generateJSON(),
        ppl: r.ppl.length > 0 ? r.ppl : null
      };
      this.broadcastTo(roomInfo, r.ppl.map(tpR => tpR._id));
    }
    if (data.m == 'a') {
      const p = this.getParticipant(s);
      if (!p) return;
      const r = this.getRoom(p.room);
      if (!r) return;
      const pR = r.findParticipant(p._id);
      if (!data.message) return;
      if (data.message.length > 255) {
        data.message.length = 255;
      }
      data.message = data.message.replace(/\r?\n|\r/g, '');
      data.message = this.removeTextHell(data.message);
      const msg = {
        m: 'a',
        p: pR.generateJSON(),
        a: data.message
      };
      r.chat.insert(msg);
      try {
        // if (r.settings.visible) webhook.send(`${r._id} - \`${p._id.substring(0, 5)}\` **${p.name}:**  ${msg.a}`);
      } catch (e) {
        // ...
      }
      return this.broadcastTo(msg, r.ppl.map(tpR => tpR._id));
    }
    if (data.m == 'n') {
      const p = this.getParticipant(s);
      if (!p) return;
      const r = this.getRoom(p.room);
      if (!r) return;
      const pR = r.findParticipant(p._id);
      if (!pR) return;
      return this.broadcastTo({
        m: 'n',
        n: data.n,
        p: pR.id,
        t: data.t
      }, r.ppl.map(tpR => tpR._id), [p._id]);
    }
    if (data.m == 'm') {
      const p = this.getParticipant(s);
      if (!p) return;
      const r = this.getRoom(p.room);
      if (!r) return;
      const pR = r.findParticipant(p._id);
      if (!pR) return;
      return this.broadcastTo({
        m: 'm',
        id: pR.id,
        x: data.x,
        y: data.y
      }, r.ppl.map(tpR => tpR._id), [p._id]);
    }
    if (data.m == '+ls') {
      const p = this.getParticipant(s);
      if (!p) return;
      p.updates = true;
      const keys = [];
      this.rooms.forEach(r => {
        if (r.settings.visible) keys.push(r.generateJSON());
      });
      return s.sendObject({
        m: 'ls',
        c: true,
        u: keys
      });
    }
    if (data.m == '-ls') {
      // ...
    }
    if (data.m == 'userset') {
      const p = this.getParticipant(s);
      if (!p) return;

      if (data.set.name) {
        const sanitizedName = this.removeTextHell(data.set.name).trim();
        if (sanitizedName.length > 250 || !sanitizedName) {
          data.set.name = 'Anonymous';
        }
        p.updateUser(sanitizedName, data.set.color);
      }

      const r = this.getRoom(p.room);
      if (r) {
        const pR = r.findParticipant(p._id);
        if (pR) {
          pR.updateUser(p.name, p.color);
          this.broadcastTo({
            m: 'p',
            color: p.color,
            id: pR.id,
            name: p.name,
            _id: p._id
          }, r.ppl.map(tpR => tpR._id));
        }
      }
    }
    if (data.m == 't') {
      return s.sendObject({
        m: 't',
        t: Date.now(),
        echo: data.e - Date.now()
      });
    }
  }
  // Participants
  newParticipant(s) {
    // Use the IP-based ID instead of socket ID
    const p = new Participant(s.ipBasedId, 'Anonymous',
      `#${Math.floor(Math.random() * 16777215).toString(16)}`);
    this.participants.set(s.ipBasedId, p);
    return p;
  }
  getParticipant(s) {
    // Try to get participant by IP-based ID first
    let p = this.participants.get(s.ipBasedId);
    if (!p) {
      // Fall back to socket ID if not found
      p = this.participants.get(s.id);
    }
    return p;
  }
  // Rooms
  newRoom(data, p) {
    const room = new Room(p, this, data._id, 0, data.set);
    this.rooms.set(room._id, room);
    return room;
  }
  getRoom(id) {
    return this.rooms.get(id);
  }
}

module.exports = Server;
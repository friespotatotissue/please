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
        if (!s.isConnected || !s.ws) {
          this.sockets.delete(s);
          return;
        }
        if (s.isAlive === false) {
          s.ws.terminate();
          return;
        }
        s.isAlive = false;
        try {
          s.ping(() => {
            s.isAlive = true;
          });
        } catch (err) {
          console.error('Ping error:', err);
          s.ws.terminate();
        }
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
      p = this.participants.get(s.ipBasedId);

      // If no participant found, create a new one with IP-based ID
      if (!p) {
        p = this.newParticipant(s);
      } else {
        // Update existing participant's connection state
        p.isConnected = true;
        p.lastSeen = Date.now();
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

      // New Room
      let r = this.getRoom(data._id);
      if (!r) {
        r = this.newRoom(data, p);
      }
      
      // Create participant first - use ipBasedId for room participants
      let pR = r.findParticipant(s.ipBasedId);
      if (!pR) {
        pR = r.newParticipant(p, s);
        r.count = r.ppl.length; // Update count when adding new participant
      }
      p.room = r._id;

      // Set crown only for new rooms and after participant is created
      if (!r.crown && !r.settings.lobby) {
        r.crown = {
          participantId: pR.id,
          userId: s.ipBasedId,
          time: Date.now()
        };
      }

      // Send room info to all participants
      const roomInfo = {
        m: 'ch',
        ch: r.generateJSON(),
        p: pR.id,
        ppl: r.ppl
      };

      // Broadcast room update to all participants
      this.broadcastTo(roomInfo, r.ppl.map(tpR => tpR._id));

      // Also send note quota info
      if (r._id.toLowerCase().includes('black')) {
        s.sendObject({
          m: 'nq',
          allowance: 8000,
          max: 24000,
          histLen: 3
        });
      } else {
        s.sendObject({
          m: 'nq',
          allowance: 200,
          max: 600,
          histLen: 0
        });
      }

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
        
        // Update the participant's name
        p.updateUser(sanitizedName, data.set.color);

        // Update all rooms where this participant exists, but only for this connection
        this.rooms.forEach(r => {
          const pR = r.findParticipant(s.id);  // Use socket ID instead of IP-based ID
          if (pR) {
            pR.updateUser(p.name, p.color);
            // Broadcast to everyone in the room
            this.broadcastTo({
              m: 'p',
              color: p.color,
              id: pR.id,
              name: p.name,
              _id: p._id
            }, r.ppl.map(tpR => tpR._id));
          }
        });
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
    // Check if there's an existing participant with this IP
    let p = this.participants.get(s.ipBasedId);
    if (p) {
      p.isConnected = true;
      p.lastSeen = Date.now();
      return p;
    }
    // Create new participant if none exists
    p = new Participant(s.ipBasedId, 'Anonymous',
      `#${Math.floor(Math.random() * 16777215).toString(16)}`);
    this.participants.set(s.ipBasedId, p);
    return p;
  }
  getParticipant(s) {
    return this.participants.get(s.ipBasedId);
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
  // Add method to clean up disconnected participants
  cleanupParticipants() {
    this.rooms.forEach(room => {
      const activePpl = room.ppl.filter(p => {
        const participant = this.participants.get(p._id);
        return participant && participant.isConnected;
      });
      room.ppl = activePpl;
      room.count = activePpl.length;
    });
  }
  // Add method to get accurate count of connected participants
  getRoomCount(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    return room.ppl.filter(p => {
      const participant = this.participants.get(p._id);
      return participant && participant.isConnected;
    }).length;
  }
}

module.exports = Server;
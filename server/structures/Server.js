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
    if (!['t', 'm', 'n'].includes(data.m)) console.log('Received message:', data);
    
    try {
      if (data.m == 'hi') {
        console.log('Client connected, sending hi response');
        const p = this.newParticipant(s);
        s.clientId = data.clientId;
        s.sendObject({
          m: 'hi',
          u: p.generateJSON(),
          t: Date.now()
        });
        
        // If there's a pending channel join, process it immediately
        if (data._id) {
          this.handleChannelJoin(s, p, data._id);
        }
        return;
      }
      
      // Add error handling for socket operations
      if (!s || !s.readyState === WebSocket.OPEN) {
        console.log('Socket not ready, attempting reconnection...');
        return;
      }

      if (data.m == 'ch') {
        console.log('Processing channel join request:', data._id);
        const p = this.getParticipant(s);
        if (!p) {
          console.log('Creating new participant for channel join');
          p = this.newParticipant(s);
        }
        return this.handleChannelJoin(s, p, data._id);
      }
      if (data.m == 'chset') {
        const p = this.getParticipant(s);
        if (!p) return;
        const r = this.getRoom(p.room);
        if (!r) return;
        
        // Only allow crown holder to change settings
        if (!r.crown || (r.crown.userId !== p._id && r.crown.clientId !== s.clientId)) {
          return;
        }
        
        // Update room settings
        r.update(data.set);
        
        // Broadcast the update to all participants
        const updateMsg = {
          m: 'ch',
          ch: r.generateJSON(),
          p: r.findParticipant(p._id).id,
          ppl: r.ppl.length > 0 ? r.ppl : null
        };
        
        try {
          this.broadcastTo(updateMsg, r.ppl.map(tpR => tpR._id));
        } catch (err) {
          console.error('Error broadcasting room update:', err);
        }
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
        
        // Ensure lobby exists
        let lobby = this.getRoom('lobby');
        if (!lobby) {
          lobby = new Room(p, this, 'lobby', 0);
          this.rooms.set('lobby', lobby);
        }
        
        // Add lobby first
        keys.push(lobby.generateJSON());
        
        // Add other visible rooms
        this.rooms.forEach(r => {
          if (r.settings.visible && r._id !== 'lobby') {
            keys.push(r.generateJSON());
          }
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
          if (data.set.name.length > 250 || !data.set.name.replace(/\s/g, '')) data.set.name = 'Invalid';
          p.updateUser(this.removeTextHell(data.set.name));
        }
        const r = this.getRoom(p.room);
        if (!r) return;
        const pR = r.findParticipant(p._id);
        if (!pR) return;
        pR.updateUser(data.set.name || 'Anonymous');
        return this.broadcastTo({
          m: 'p',
          color: p.color,
          id: pR.id,
          name: p.name,
          _id: p._id
        }, r.ppl.map(tpR => tpR._id));
      }
      if (data.m == 't') {
        return s.sendObject({
          m: 't',
          t: Date.now(),
          echo: data.e - Date.now()
        });
      }
    } catch (err) {
      console.error('Error handling socket data:', err);
      s.sendObject({
        m: 'notification',
        title: 'Error',
        text: 'An error occurred. Please try refreshing the page.',
        duration: 7000
      });
    }
  }
  handleChannelJoin(s, p, channelId) {
    console.log('Handling channel join for:', channelId);
    
    // Leave old room
    const old = this.getRoom(p.room);
    if (old) {
      old.removeParticipant(p._id);
      if (old.count <= 0) {
        console.log('Removing empty room:', old._id);
        this.rooms.delete(p.room);
      }
    }
    
    // Join new room
    let r = this.getRoom(channelId);
    if (!r) {
      console.log('Creating new room:', channelId);
      r = this.newRoom({_id: channelId}, p);
    }
    
    let pR = r.findParticipant(p._id);
    if (!pR) {
      console.log('Adding participant to room:', p._id);
      pR = r.newParticipant(p);
    }
    p.room = r._id;
    
    // Handle crown
    if (!r.settings.lobby) {
      if (!r.crown) {
        console.log('Setting initial crown for room');
        r.crown = {
          participantId: pR.id,
          userId: p._id,
          clientId: s.clientId,
          time: new Date()
        };
      } else if (r.crown.userId === p._id || r.crown.clientId === s.clientId) {
        console.log('Updating crown for returning owner');
        r.crown.participantId = pR.id;
        r.crown.clientId = s.clientId;
      }
      this.rooms.set(r._id, r);
    }
    
    // Send room state
    try {
      // Send note quota
      s.sendObject({
        m: 'nq',
        allowance: r._id.toLowerCase().includes('black') ? 8000 : 200,
        max: r._id.toLowerCase().includes('black') ? 24000 : 600,
        histLen: r._id.toLowerCase().includes('black') ? 3 : 0
      });
      
      // Clear chat and send history
      s.sendObject({m: 'c'});
      if (r.chat && r.chat.messages.length > 0) {
        const chatobjs = r.chat.messages.slice(-50).reverse();
        s.sendArray(chatobjs);
      }
      
      // Send room info to everyone
      const roomInfo = {
        m: 'ch',
        ch: r.generateJSON(),
        p: pR.id,
        ppl: r.ppl.length > 0 ? r.ppl : null
      };
      
      // Broadcast to all participants including the joiner
      this.broadcastTo(roomInfo, r.ppl.map(tpR => tpR._id));
      
      console.log('Successfully joined channel:', channelId);
      return true;
    } catch (err) {
      console.error('Error sending room state:', err);
      r.removeParticipant(p._id);
      s.sendObject({
        m: 'notification',
        title: 'Error',
        text: 'Failed to join room. Please try again.',
        duration: 7000
      });
      return false;
    }
  }
  // Participants
  newParticipant(s) {
    const p = new Participant(s.id, 'Anonymous',
      `#${Math.floor(Math.random() * 16777215).toString(16)}`);
    this.participants.set(s.id, p);
    return p;
  }
  getParticipant(s) {
    return this.participants.get(s.id);
  }
  // Rooms
  newRoom(data, p) {
    const room = new Room(p, this, data._id, 0, data.set);
    if (!room.settings.lobby) {
      room.crown = {
        participantId: null,  // Will be set when creator joins
        userId: p._id,
        time: new Date()
      };
    }
    this.rooms.set(room._id, room);
    return room;
  }
  getRoom(id) {
    return this.rooms.get(id);
  }
}

module.exports = Server;
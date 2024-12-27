const bgColor = '#206694';
const Chat = require('./Chat.js');
const ParticipantRoom = require('./ParticipantRoom.js');
const sha1 = require('sha1');

/**
 * TODO: ONLY ALLOW ONE BLACK MIDI ROOM AT A TIME
 */

class Room {
  constructor(p, server, _id, count, set) {
    this.server = server;
    this._id = _id;
    this.count = count || 0;
    const isLobby = _id.toLowerCase().includes('lobby');
    this.settings = {
      chat: true,
      color: bgColor,
      visible: true,
      crownsolo: false,
      lobby: isLobby,
      ...set
    };
    this.ppl = [];
    this.chat = new Chat();
    this.crown = null;
  }

  update(set) {
    if (!set) return;
    if (set.visible !== undefined) this.settings.visible = !!set.visible;
    if (set.chat !== undefined) this.settings.chat = !!set.chat;
    if (set.crownsolo !== undefined) this.settings.crownsolo = !!set.crownsolo;
    if (set.color) this.settings.color = set.color;
    
    // Broadcast the update
    if (this.server) {
      this.server.broadcastTo({
        m: 'ch',
        ch: this.generateJSON()
      }, this.ppl.map(p => p._id));
    }
  }

  findParticipant(_id) {
    return this.ppl.find(p => p._id === _id);
  }

  newParticipant(p) {
    // Generate a unique ID for the participant
    const id = this.count++;
    const participant = new ParticipantRoom(
      id,
      p.name,
      p.color,
      p._id
    );
    this.ppl.push(participant);

    // Notify others about the new participant
    if (this.server) {
      this.server.broadcastTo({
        m: 'p',
        id: participant.id,
        name: p.name,
        color: p.color,
        _id: p._id
      }, this.ppl.map(p => p._id), [p._id]);
    }

    return participant;
  }

  removeParticipant(_id) {
    const index = this.ppl.findIndex(p => p._id === _id);
    if (index !== -1) {
      const participant = this.ppl[index];
      this.ppl.splice(index, 1);

      // Handle crown transfer if crown holder leaves
      if (this.crown && this.crown.userId === _id) {
        if (this.ppl.length > 0) {
          // Find next connected participant
          const nextParticipant = this.ppl.find(p => {
            const participant = this.server.participants.get(p._id);
            return participant && participant.isConnected;
          });
          
          if (nextParticipant) {
            this.crown = {
              participantId: nextParticipant.id,
              userId: nextParticipant._id,
              time: Date.now()
            };
            // Notify about crown transfer
            if (this.server) {
              this.server.broadcastTo({
                m: 'ch',
                ch: this.generateJSON()
              }, this.ppl.map(p => p._id));
            }
          } else {
            this.crown = null;
          }
        } else {
          this.crown = null;
        }
      }

      // Notify about participant removal
      if (this.server) {
        this.server.broadcastTo({
          m: 'bye',
          p: participant.id
        }, this.ppl.map(p => p._id));
      }
    }
  }

  generateJSON() {
    const json = {
      _id: this._id,
      settings: this.settings,
      count: this.server.getRoomCount(this._id)
    };
    if (this.crown) {
      json.crown = this.crown;
    }
    return json;
  }
}

module.exports = Room;
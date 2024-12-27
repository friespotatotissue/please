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
    this.count = count;
    this.settings = {
      chat: true,
      color: '#ecfaed',
      visible: true,
      crownsolo: false,
      lobby: false,
      ...set
    };
    this.ppl = [];
    this.chat = {
      messages: []
    };
    this.crown = null;
  }

  update(set) {
    if (set.visible !== undefined) this.settings.visible = !!set.visible;
    if (set.chat !== undefined) this.settings.chat = !!set.chat;
    if (set.crownsolo !== undefined) this.settings.crownsolo = !!set.crownsolo;
    if (set.color) this.settings.color = set.color;
  }

  findParticipant(_id) {
    return this.ppl.find(p => p._id === _id);
  }

  newParticipant(p) {
    const participant = new ParticipantRoom(
      this.count++,
      p.name,
      p.color,
      p._id
    );
    this.ppl.push(participant);
    return participant;
  }

  removeParticipant(_id) {
    const index = this.ppl.findIndex(p => p._id === _id);
    if (index !== -1) {
      this.ppl.splice(index, 1);
      // If crown holder leaves, pass crown to next person or remove it
      if (this.crown && this.crown.userId === _id) {
        if (this.ppl.length > 0) {
          const nextParticipant = this.ppl[0];
          this.crown = {
            participantId: nextParticipant.id,
            userId: nextParticipant._id,
            time: Date.now()
          };
        } else {
          this.crown = null;
        }
      }
    }
  }

  generateJSON() {
    return {
      _id: this._id,
      settings: this.settings,
      crown: this.crown,
      count: this.count
    };
  }
}

module.exports = Room;
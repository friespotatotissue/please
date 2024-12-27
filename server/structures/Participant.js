const fs = require('fs');
const path = require('path');

/**
 * TODO: Impliment a system in which users will get their
 * user saved to MongoDB, and users who have not been seen
 * within 7 days will get their userinfo deleted. Similar to how
 * when your IP changes, you're a completely different user.
 */

class Participant {
  constructor(_id, name, color) {
    this._id = _id;
    this.name = name;
    this.color = color;
    this.room = null;
    this.updates = false;

    // Ensure database directory exists
    const dbDir = path.join(process.cwd(), 'database');
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
      } catch (e) {
        console.error('Failed to create database directory:', e);
      }
    }

    const pdb = this.requestFile();
    if (!pdb) {
      // Initialize with empty object if file doesn't exist
      this.updateFile({});
      return;
    }
    if (pdb[this._id]) {
      this.name = pdb[this._id].name;
      this.color = pdb[this._id].color;
    } else {
      pdb[this._id] = this.generateJSON();
      this.updateFile(pdb);
    }
  }

  requestFile() {
    try {
      const filePath = path.join(process.cwd(), 'database', 'participants.json');
      if (!fs.existsSync(filePath)) {
        return {};
      }
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('DB REQUEST FILE', e);
      return {};
    }
  }

  updateFile(raw) {
    try {
      const filePath = path.join(process.cwd(), 'database', 'participants.json');
      fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('DB UPDATE FILE', e);
      return false;
    }
  }

  updateUser(name, color) {
    try {
      const pdb = this.requestFile();
      if (!pdb) {
        console.error('Failed to read database for update');
        return false;
      }

      // Update the participant's data
      this.name = name || this.name;
      this.color = color || this.color;

      // Update the database
      pdb[this._id] = this.generateJSON();
      const success = this.updateFile(pdb);

      if (!success) {
        console.error('Failed to update database');
        return false;
      }

      return true;
    } catch (e) {
      console.error('Error in updateUser:', e);
      return false;
    }
  }

  generateJSON() {
    return {
      _id: this._id,
      name: this.name,
      color: this.color
    };
  }
}

module.exports = Participant;
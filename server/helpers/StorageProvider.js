/**
 * Storage Provider Abstraction Layer
 * Allows easy switching between local storage and cloud providers (Cloudflare R2, S3, etc.)
 */

const path = require('path');
const fs = require('fs');

const MEDIA_DIR = path.join(__dirname, '../storage/media');

const StorageProvider = {
  provider: 'local',

  async saveFile(file) {
    if (this.provider === 'local') {
      return this._saveLocal(file);
    }
    // Future: cloud provider implementation
    return this._saveLocal(file);
  },

  async getUrl(filename) {
    if (this.provider === 'local') {
      return this._getLocalUrl(filename);
    }
    // Future: cloud provider implementation
    return this._getLocalUrl(filename);
  },

  _saveLocal(file) {
    // multer already saves the file to disk, so we just return success
    return {
      success: true,
      filename: file.filename,
      provider: 'local'
    };
  },

  _getLocalUrl(filename) {
    return `/media/${filename}`;
  },

  setProvider(providerName) {
    this.provider = providerName;
    console.log(`[Storage] Provider set to: ${providerName}`);
  }
};

module.exports = StorageProvider;
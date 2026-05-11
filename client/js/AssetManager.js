const AssetManager = {
  loaded: false,

  preload(callback) {
    const img = new Image();
    img.onload = () => { this.loaded = true; if (callback) callback(); };
    img.onerror = () => { this.loaded = true; if (callback) callback(); };
    img.src = getComputedStyle(document.documentElement)
      .getPropertyValue('--sprite-icons')
      .trim()
      .replace(/^url\(["']?|["']?\)$/g, '');
    setTimeout(() => { if (!this.loaded) { this.loaded = true; if (callback) callback(); } }, 3000);
  },

  icon(name) {
    return `<span class="ico ico-${name}" aria-hidden="true"></span>`;
  },

  iconEl(name) {
    const el = document.createElement('span');
    el.className = `ico ico-${name}`;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
};

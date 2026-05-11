const AssetManager = {
  loaded: true,

  _iconMap: {
    chat: 'message-square',
    gallery: 'images',
    pinned: 'pin',
    dates: 'calendar-days',
    call: 'phone',
    video: 'video',
    search: 'search',
    delete: 'trash-2',
    close: 'x',
    settings: 'settings',
    menu: 'menu',
    spotify: 'headphones',
    connect: 'link',
    attach: 'paperclip',
    gif: 'file-image',
    mic: 'mic',
    emoji: 'smile-plus',
    send: 'send',
    reply: 'reply',
    copy: 'copy',
    react: 'heart',
    edit: 'pencil',
    calendar: 'calendar',
    routine: 'repeat',
    'mute-on': 'volume-2',
    'mute-off': 'volume-x',
    'cam-on': 'camera',
    'cam-off': 'camera-off',
    screen: 'monitor',
    minimize: 'minus',
    hangup: 'phone-off',
    logout: 'log-out',
    export: 'download',
    bell: 'bell',
    upload: 'upload',
    save: 'save',
    globe: 'globe',
    'arrow-prev': 'chevron-left',
    'arrow-next': 'chevron-right',
    file: 'file',
    image: 'image',
    'file-video': 'film',
    audio: 'file-audio'
  },

  preload(callback) {
    if (callback) callback();
  },

  icon(name) {
    const lucideName = this._iconMap[name] || name;
    return `<i class="icon-${lucideName}" aria-hidden="true"></i>`;
  },

  iconEl(name) {
    const lucideName = this._iconMap[name] || name;
    const el = document.createElement('i');
    el.className = `icon-${lucideName}`;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
};
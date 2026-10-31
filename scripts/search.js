/* Pure search helpers shared by every page adapter. */
(() => {
  'use strict';
  const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  function defaultTitle(title, kind) {
    const full = clean(title);
    // Preserve the original page-specific searches; never generate an empty query.
    const shortened = kind === 'card' || kind === 'compact'
      ? full.split(':')[0]
      : full.replace(/ -[^-]+- \(\d{4}\)/, '')
        .replace(/\d+(st|nd|rd|th) Season/, '')
        .replace(/Season \d+/, '');
    return clean(shortened) || full;
  }
  function searchUrl(title, sort = 'seeders', group = '') {
    const url = new URL('https://nyaa.si/');
    const q = [clean(group), clean(title)].filter(Boolean).join(' ');
    url.search = new URLSearchParams({f:'0', c:'0_0', q, o:'desc', s:sort === 'id' ? 'id' : 'seeders'});
    return url.href;
  }
  globalThis.LCEFSearch = {clean, defaultTitle, searchUrl};
  if (typeof module !== 'undefined') module.exports = globalThis.LCEFSearch;
})();

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
  function broadTitle(title) {
    const full = clean(title);
    // Only an explicit alternative: never silently change the primary query.
    const broad = full.split(/[:：]/)[0]
      .replace(/\s+(?:\d+(?:st|nd|rd|th)\s+season|season\s+\d+)(?:\s+cour\s+\d+)?\s*$/i, '')
      .replace(/\s+(?:cour|part)\s+\d+\s*$/i, '').trim();
    return broad || full;
  }
  function searchUrl(title, sort = 'seeders', group = '') {
    const url = new URL('https://nyaa.si/');
    const q = [clean(group), clean(title)].filter(Boolean).join(' ');
    url.search = new URLSearchParams({f:'0', c:'0_0', q, o:'desc', s:sort === 'id' ? 'id' : 'seeders'});
    return url.href;
  }
  function episodeNumber(text) {
    const match = clean(text).match(/^EP\s*(\d+(?:\.\d+)?)$/i);
    return match ? match[1].padStart(2, '0') : '';
  }
  globalThis.LCEFSearch = {clean, defaultTitle, broadTitle, searchUrl, episodeNumber};
  if (typeof module !== 'undefined') module.exports = globalThis.LCEFSearch;
})();

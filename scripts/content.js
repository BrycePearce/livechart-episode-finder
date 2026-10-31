(() => {
  'use strict';
  if (globalThis.livechartEpisodeFinder) return;
  globalThis.livechartEpisodeFinder = true;
  const {clean, defaultTitle, searchUrl} = globalThis.LCEFSearch;
  const notifications = '[data-controller~="notification"], [data-notification-list-target~="notification"]';
  const cards = '[data-controller~="anime-item"], [data-anime-card-grid-target~="card"], article[data-anime-card-list-target]';
  const details = '[data-controller~="anime-details"]';
  const items = `${notifications}, ${cards}, ${details}`;
  const own = '[data-lcef-controls]';
  const titleAttrs = ['data-anime-item-romanized-native-title', 'data-anime-details-romanized-native-title', 'data-romaji', 'data-preferred-title-romaji'];
  const englishAttrs = ['data-anime-item-english-title', 'data-anime-details-english-title'];
  const state = new WeakMap();
  const nativeButton = 'lcm3-button flex select-none items-center justify-center lcm3-button--sm lcm3-button--round lcm3-button--text';

  // Do not borrow data, links or insertion hosts from a nested/related anime.
  function owned(item, selector) {
    return Array.from(item.querySelectorAll(selector)).filter(el => el.closest(items) === item);
  }
  function attributeTitle(item, attributes) {
    for (const attr of attributes) {
      const title = clean(item.getAttribute(attr)) || clean(owned(item, `[${attr}]`)[0]?.getAttribute(attr));
      if (title) return title;
    }
    return '';
  }
  function readInfo(item) {
    const first = selector => owned(item, selector)[0];
    let title = attributeTitle(item, titleAttrs);
    let english = attributeTitle(item, englishAttrs);
    let kind = 'card';
    let host;
    let prepend = false;
    let rowTemplate;
    if (item.matches(notifications)) {
      let actions = [];
      try {
        const parsed = JSON.parse(item.getAttribute('data-notification-actions') || '[]');
        if (Array.isArray(parsed)) actions = parsed;
      } catch { /* Older/partial notifications can still provide DOM titles. */ }
      const anime = actions.find(action => action?.type === 'edit_list');
      const schedule = owned(item, 'a[href]').some(link => {
        try {
          const url = new URL(link.getAttribute('href'), location.href);
          return url.origin === location.origin && /^\/anime\/\d+\/schedules\/\d+\/?$/.test(url.pathname);
        } catch { return false; }
      });
      const legacy = owned(item, '*').some(el => /^(?:release|episode) reminders$/i.test(clean(el.textContent)));
      if (!schedule && !actions.some(action => action?.type === 'airing:set_progress') && !legacy) return null;
      title = clean(anime?.romanized_native_title) || title;
      english = clean(anime?.english_title) || english;
      title ||= english || clean(first('.lc-notification-item__layout__body > div')?.textContent);
      host = first('[data-notification-target~="actions"]') || first('[data-controller~="notification-action"]')?.parentElement;
      kind = 'notification';
    } else if (item.matches(details)) {
      // External-resource buttons exist on Info; fall back to the title on other detail tabs.
      host = first('a[href^="https://anilist.co/"], a[href^="https://myanimelist.net/"]')?.parentElement;
      if (!host) host = first('[data-anime-details-target~="preferredTitle"]')?.parentElement;
      kind = 'detail';
    } else if (item.matches('[data-timeslot-target~="anime"]')) {
      host = item;
      kind = 'schedule';
    } else {
      host = first('[data-anime-item-target~="synopsis"]');
      prepend = !!host;
      const metadata = first('.lc-anime-details-card__metadata');
      if (host && metadata && item.matches('.lc-anime-details-card')) {
        rowTemplate = metadata;
        // Keep the native synopsis intact in its grid area, below a native-style row.
        let body = host.parentElement;
        if (!body.matches('[data-lcef-body]')) {
          body = make('div', 'lcef-card-body');
          body.dataset.lcefBody = '';
          host.before(body);
          body.append(host);
        }
        host = body;
      }
      host ||= first('[data-anime-item-target~="footerActionGroup"]') || first('.anime-card');
      if (!host) {
        // Compact/simple cards: place after the title in its content area, not over the poster.
        host = item;
        kind = 'compact';
      }
      host ||= item;
    }
    title ||= english || clean(first('[data-anime-item-target~="preferredTitle"], .anime-title')?.textContent);
    return title && host ? {title, kind, host, prepend, rowTemplate} : null;
  }
  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function buttonContents(button, text) {
    const layer = make('span', 'lcm3-container-state-layer');
    layer.setAttribute('aria-hidden', 'true');
    button.append(layer, make('span', 'lcm3-button__label shrink text-center truncate', text));
  }
  function appearance(info) {
    // Borrow only native visual modifiers, never a neighbor's actions, IDs or state.
    const neighbor = Array.from(info.host.children).find(el =>
      !el.matches(own) && el.matches('a.lcm3-button, button.lcm3-button'));
    const textLink = !neighbor && (info.kind === 'card' || info.kind === 'compact');
    const modifiers = neighbor && Array.from(neighbor.classList).filter(name =>
      /^lcm3-button--(?:xs|sm|md|lg|xl|round|square|text|outlined|filled|tonal|elevated)$/.test(name));
    const buttonClass = modifiers?.length
      ? `lcm3-button flex select-none items-center justify-center ${modifiers.join(' ')}`
      : nativeButton;
    return {textLink, buttonClass};
  }
  function updateLink(link, title) {
    const href = searchUrl(title);
    if (link.href !== href) link.href = href;
    const label = `Search Nyaa for ${title} (opens in a new tab)`;
    if (link.title !== label) { link.title = label; link.setAttribute('aria-label', label); }
  }
  function enhance(item) {
    if (!item.isConnected) return;
    const info = readInfo(item);
    let controls = state.get(item)?.controls;
    if (!info) {
      controls?.remove(); state.delete(item);
      return;
    }
    if (!controls) {
      controls = make('span','lcef-controls');
      controls.dataset.lcefControls = '';
      const link = make('a');
      link.dataset.lcefLink = '';
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      controls.append(link);
      for (const type of ['click','auxclick','pointerdown']) controls.addEventListener(type, event => event.stopPropagation());
      state.set(item, {controls, link});
    }
    const {link} = state.get(item);
    const {textLink, buttonClass} = appearance(info);
    const presentation = `${info.kind}:${textLink}:${buttonClass}:${info.rowTemplate?.className || ''}`;
    if (controls.dataset.lcefPresentation !== presentation) {
      controls.className = info.rowTemplate ? `lcef-controls lcef-native-row ${info.rowTemplate.className}` : 'lcef-controls';
      controls.dataset.lcefKind = info.kind;
      controls.dataset.lcefPresentation = presentation;
      controls.dataset.lcefStyle = textLink ? 'text' : 'button';
      link.className = textLink
        ? 'lcef-link lcef-link--chart lc--focus-ring lc--focus-ring-inner lcm3-text lcm3-text--body-sm text-m3-primary lc-link lc-link-hover'
        : `lcef-link ${buttonClass}`;
      link.replaceChildren();
      if (textLink) link.textContent = 'Nyaa.si';
      else buttonContents(link, 'Nyaa.si');
    }
    updateLink(link, defaultTitle(info.title, info.kind));
    if (controls.parentElement !== info.host) {
      if (info.prepend) info.host.prepend(controls);
      else info.host.append(controls);
    }
  }
  function refreshAll() { document.querySelectorAll(items).forEach(enhance); }
  const pending = new Set();
  let timer;
  function collect(node, descendants = false) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el.closest(own)) return;
    const item = el.closest(items);
    if (item) pending.add(item);
    if (descendants) el.querySelectorAll(items).forEach(item => pending.add(item));
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const el = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (el?.closest(`time, [data-controller~="countdown"], ${own}`)) continue;
      // A container mutation must not rescan every existing card on the page.
      if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === 1 && node.matches(own))) continue;
      collect(record.target);
      record.addedNodes.forEach(node => collect(node, true));
    }
    if (timer !== undefined || !pending.size) return;
    timer = setTimeout(() => {
      timer = undefined;
      const batch = Array.from(pending); pending.clear(); batch.forEach(enhance);
    }, 0);
  });
  observer.observe(document.documentElement, {
    subtree:true, childList:true, characterData:true, attributes:true,
    attributeFilter:[...titleAttrs, ...englishAttrs, 'data-notification-actions', 'data-anime-item-target', 'data-notification-target', 'data-anime-card-grid-target', 'data-anime-card-list-target', 'data-controller', 'data-anime-item-id', 'data-anime-details-id', 'href']
  });
  refreshAll();
})();

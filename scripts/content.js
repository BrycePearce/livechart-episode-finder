(() => {
  'use strict';
  if (globalThis.livechartEpisodeFinder) return;
  globalThis.livechartEpisodeFinder = true;
  const {clean, defaultTitle, broadTitle, searchUrl, episodeNumber} = globalThis.LCEFSearch;
  const notifications = '[data-controller~="notification"], [data-notification-list-target~="notification"]';
  const cards = '[data-controller~="anime-item"], [data-anime-card-grid-target~="card"], article[data-anime-card-list-target]';
  const details = '[data-controller~="anime-details"]';
  const items = `${notifications}, ${cards}, ${details}`;
  const own = '[data-lcef-controls], [data-lcef-menu]';
  const titleAttrs = ['data-anime-item-romanized-native-title', 'data-anime-details-romanized-native-title', 'data-romaji', 'data-preferred-title-romaji'];
  const englishAttrs = ['data-anime-item-english-title', 'data-anime-details-english-title'];
  const storage = globalThis.chrome?.storage;
  let preferences = {};
  let activePanel;
  let sequence = 0;
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
  function animeLink(item) {
    return owned(item, 'a[href]').map(link => {
      try {
        const url = new URL(link.getAttribute('href'), location.href);
        return url.origin === location.origin ? url.pathname.match(/^\/anime\/(\d+)(?:\/schedules\/\d+)?\/?$/) : null;
      } catch { return null; }
    }).find(Boolean);
  }
  function readInfo(item) {
    const first = selector => owned(item, selector)[0];
    let title = attributeTitle(item, titleAttrs);
    let english = attributeTitle(item, englishAttrs);
    let id = item.getAttribute('data-anime-item-id') || item.getAttribute('data-anime-details-id') || item.getAttribute('data-anime-id') || animeLink(item)?.[1] || '';
    let kind = 'card';
    let host;
    let prepend = false;
    let episode = '';
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
      id = String(anime?.anime_id || id);
      title ||= english || clean(first('.lc-notification-item__layout__body > div')?.textContent);
      host = first('[data-notification-target~="actions"]') || first('[data-controller~="notification-action"]')?.parentElement;
      episode = episodeNumber(first('.lc-notification-item__layout__body strong')?.textContent);
      kind = 'notification';
    } else if (item.matches(details)) {
      // External-resource buttons exist on Info; fall back to the title on other detail tabs.
      host = first('a[href^="https://anilist.co/"], a[href^="https://myanimelist.net/"]')?.parentElement;
      if (!host) host = first('[data-anime-details-target~="preferredTitle"]')?.parentElement;
      kind = 'detail';
    } else if (item.matches('[data-timeslot-target~="anime"]')) {
      host = item;
      kind = 'schedule';
      episode = episodeNumber(first('.lc-timetable-anime-block__label strong')?.textContent);
    } else {
      host = first('[data-anime-item-target~="synopsis"]');
      prepend = !!host;
      host ||= first('[data-anime-item-target~="footerActionGroup"]') || first('.anime-card');
      if (!host) {
        // Compact/simple cards: place after the title in its content area, not over the poster.
        host = item;
        kind = 'compact';
      }
      host ||= item;
    }
    title ||= english || clean(first('[data-anime-item-target~="preferredTitle"], .anime-title')?.textContent);
    return title && host ? {title, english, id:/^\d+$/.test(id) ? id : '', kind, host, prepend, episode} : null;
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
  function savedTitle(info) { return info.id ? clean(preferences[`title:${info.id}`]) : ''; }
  function configuredTitle(info) { return savedTitle(info) || defaultTitle(info.title, info.kind); }
  function updateLink(link, title) {
    const href = searchUrl(title, preferences.sort, preferences.group);
    if (link.href !== href) link.href = href;
    const label = `Search Nyaa for ${title} (opens in a new tab)`;
    if (link.title !== label) { link.title = label; link.setAttribute('aria-label', label); }
  }
  function closePanel(restoreFocus = false) {
    if (!activePanel) return;
    const {panel, trigger} = activePanel;
    activePanel = null;
    trigger.setAttribute('aria-expanded', 'false');
    panel.remove();
    if (restoreFocus && trigger.isConnected) trigger.focus();
  }
  function positionPanel() {
    if (!activePanel) return;
    const {panel, trigger} = activePanel;
    if (!trigger.isConnected) { closePanel(); return; }
    const rect = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const top = rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  function openPanel(item, trigger) {
    if (activePanel?.trigger === trigger) { closePanel(true); return; }
    closePanel();
    const info = readInfo(item);
    if (!info) return;
    const panel = make('div', 'lcef-menu lcm3-card lcm3-card--elevated');
    panel.dataset.lcefMenu = '';
    panel.id = `lcef-options-${++sequence}`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `Nyaa search options for ${info.title}`);
    panel.setAttribute('popover', 'auto');
    panel.append(make('div', 'lcef-menu__heading', 'Nyaa search'));
    const subtitle = make('div', 'lcef-menu__subtitle', info.title);
    panel.append(subtitle);
    const searches = make('div', 'lcef-menu__searches');
    function refreshSearches() {
      searches.replaceChildren();
      const defaultQuery = defaultTitle(info.title, info.kind);
      const options = [['Full title', info.title]];
      if (defaultQuery !== info.title) options.unshift(['Default search', defaultQuery]);
      const broad = broadTitle(info.title);
      if (broad !== info.title && broad !== defaultQuery) options.push(['Broader series', broad]);
      if (info.english && info.english !== info.title) options.push(['English title', info.english]);
      if (info.episode) options.push([`Episode ${info.episode}`, `${configuredTitle(info)} ${info.episode}`]);
      if (savedTitle(info)) options.unshift(['Saved search title', savedTitle(info)]);
      for (const [label, title] of options) {
        if (label === 'Broader series' && title === info.title) continue;
        const a = make('a', 'lcef-menu__search');
        a.href = searchUrl(title, preferences.sort, preferences.group);
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.append(make('span', '', label), make('small', '', title));
        a.title = `${title} (opens in a new tab)`;
        searches.append(a);
      }
    }
    refreshSearches();
    panel.append(searches);
    if (info.episode) panel.append(make('small', 'lcef-menu__hint', 'Episode numbering may differ between releases.'));
    const form = make('form', 'lcef-menu__form');
    function field(labelText, input) {
      const label = make('label', 'lcef-menu__field', labelText);
      label.append(input); form.append(label); return input;
    }
    const override = field('Search title for this anime', make('input'));
    override.type = 'text'; override.maxLength = 250;
    override.value = info.id ? clean(preferences[`title:${info.id}`]) : '';
    override.placeholder = defaultTitle(info.title, info.kind);
    override.disabled = !info.id;
    const sort = field('Sort all searches by', make('select'));
    for (const [value, label] of [['seeders','Most seeders'],['id','Newest first']]) {
      const option = make('option','',label); option.value = value; sort.append(option);
    }
    sort.value = preferences.sort === 'id' ? 'id' : 'seeders';
    const group = field('Release group for all searches (optional)', make('input'));
    group.type = 'text'; group.maxLength = 100; group.value = clean(preferences.group);
    group.placeholder = 'Any group';
    form.append(make('small','lcef-menu__hint','Clear the search title to restore the default cleanup. Preferences stay in this browser.'));
    const save = make('button', nativeButton); save.type = 'submit'; buttonContents(save, 'Save preferences');
    const status = make('div','lcef-menu__status'); status.setAttribute('role','status');
    form.append(save, status);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = {sort:sort.value === 'id' ? 'id' : 'seeders', group:clean(group.value)};
      if (info.id) values[`title:${info.id}`] = clean(override.value);
      save.disabled = true;
      try {
        if (!storage?.local) throw new Error('Storage unavailable');
        await storage.local.set(values);
        Object.assign(preferences, values);
        refreshAll(); refreshSearches();
        status.textContent = 'Saved. The main link uses these preferences.';
      } catch {
        status.textContent = 'Could not save. Reload the extension and try again.';
      } finally { save.disabled = false; positionPanel(); }
    });
    panel.append(form);
    panel.addEventListener('click', event => event.stopPropagation());
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePanel(true); }
    });
    // Pull the page's current theme colors without hardcoding dark/light mode.
    const theme = getComputedStyle(document.body);
    panel.style.color = theme.color;
    const surface = getComputedStyle(item).backgroundColor;
    panel.style.backgroundColor = surface && surface !== 'rgba(0, 0, 0, 0)' && surface !== 'transparent' ? surface : theme.backgroundColor;
    document.body.append(panel);
    activePanel = {panel, trigger, item, identity: `${info.id}:${info.title}`, refreshSearches};
    trigger.setAttribute('aria-expanded','true');
    trigger.setAttribute('aria-controls',panel.id);
    if (panel.showPopover) panel.showPopover(); else panel.removeAttribute('popover');
    panel.addEventListener('toggle', event => {
      if (event.newState === 'closed' && activePanel?.panel === panel) closePanel();
    });
    positionPanel();
    searches.querySelector('a')?.focus();
  }
  document.addEventListener('pointerdown', event => {
    if (activePanel && !activePanel.panel.contains(event.target) && !activePanel.trigger.contains(event.target)) closePanel();
  });
  window.addEventListener('resize', positionPanel);
  document.addEventListener('scroll', event => {
    if (activePanel && !activePanel.panel.contains(event.target)) closePanel();
  }, true);

  function enhance(item) {
    if (!item.isConnected) return;
    const info = readInfo(item);
    let controls = state.get(item)?.controls;
    if (!info) {
      controls?.remove(); state.delete(item);
      if (activePanel?.item === item) closePanel();
      return;
    }
    if (!controls) {
      controls = make('span','lcef-controls');
      controls.dataset.lcefControls = '';
      const link = make('a');
      link.dataset.lcefLink = '';
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      const trigger = make('button', `lcef-options ${nativeButton}`);
      trigger.type = 'button'; buttonContents(trigger, '▾');
      trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-expanded','false');
      trigger.addEventListener('click', () => openPanel(item, trigger));
      controls.append(link, trigger);
      for (const type of ['click','auxclick','pointerdown']) controls.addEventListener(type, event => event.stopPropagation());
      state.set(item, {controls, link, trigger});
    }
    if (activePanel?.item === item && activePanel.identity !== `${info.id}:${info.title}`) closePanel();
    const {link, trigger} = state.get(item);
    const {textLink, buttonClass} = appearance(info);
    const presentation = `${info.kind}:${textLink}:${buttonClass}`;
    if (controls.dataset.lcefPresentation !== presentation) {
      controls.dataset.lcefKind = info.kind;
      controls.dataset.lcefPresentation = presentation;
      controls.dataset.lcefStyle = textLink ? 'text' : 'button';
      link.className = textLink
        ? 'lcef-link lcef-link--chart lc--focus-ring lc--focus-ring-inner lcm3-text lcm3-text--body-sm lc-link lc-link-hover'
        : `lcef-link ${buttonClass}`;
      trigger.className = `lcef-options ${buttonClass}`;
      link.replaceChildren();
      if (textLink) link.textContent = 'Nyaa.si';
      else buttonContents(link, 'Nyaa.si');
    }
    const name = `Nyaa search options for ${info.title}`;
    if (trigger.getAttribute('aria-label') !== name) { trigger.setAttribute('aria-label',name); trigger.title = name; }
    updateLink(link, configuredTitle(info));
    if (controls.parentElement !== info.host) {
      if (info.prepend) info.host.prepend(controls);
      else info.host.append(controls);
    }
  }
  function refreshAll() { document.querySelectorAll(items).forEach(enhance); }
  const pending = new Set();
  let timer;
  function collect(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el.closest(own)) return;
    const item = el.closest(items);
    if (item) pending.add(item);
    el.querySelectorAll(items).forEach(item => pending.add(item));
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const el = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (el?.closest(`time, [data-controller~="countdown"], ${own}`)) continue;
      collect(record.target);
      record.addedNodes.forEach(collect);
    }
    if (activePanel && !activePanel.trigger.isConnected) closePanel();
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
  if (storage?.local) {
    storage.local.get(null).then(values => { preferences = values || {}; refreshAll(); activePanel?.refreshSearches(); }).catch(() => {});
    storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const [key, change] of Object.entries(changes)) preferences[key] = change.newValue;
      refreshAll(); activePanel?.refreshSearches();
    });
  }
})();

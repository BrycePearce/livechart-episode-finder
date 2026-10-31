const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {JSDOM} = require('jsdom');
const source = readFileSync('scripts/content.js', 'utf8');
const card = `<article data-anime-card-grid-target="card" data-anime-item-romanized-native-title="Example: Season 3 &amp; #2"><a data-anime-item-target="preferredTitle">English title</a><div data-anime-item-target="footerActionGroup"></div></article>`;
// Minimal fixtures based on the inspected redesign; no account data is included.
function reminder({schedule=true, actions=true}={}) {
  return `<div data-controller="other notification" data-notification-list-target="notification" ${actions ? `data-notification-actions='[{"type":"edit_list","romanized_native_title":"Romaji Season 3","english_title":"English"}]'` : ''}>
  <a href="/anime/1${schedule ? '/schedules/2' : ''}"></a>
  <div class="lc-notification-item__layout__body"><div>Visible title</div><div>Broadcast (Japan)</div><strong>EP5</strong><time>0s</time></div>
  <div data-notification-target="actions"><button>Edit list</button></div></div>`;
}
function setup(t, html='', stored={}) {
  const dom = new JSDOM(html, {url:'https://www.livechart.me/notifications?page=2', runScripts:'outside-only'});
  t.after(() => dom.window.close());
  dom.window.chrome = {storage:{local:{get:async()=>stored,set:async()=>{}},onChanged:{addListener:fn=>{dom.window.storageChanged=fn;}}}};
  dom.window.eval(readFileSync('scripts/search.js','utf8'));
  dom.window.eval(source);
  return dom.window;
}
const links = w => [...w.document.querySelectorAll('[data-lcef-link]')];
const query = link => new URL(link.href).searchParams.get('q');
const settle = w => new Promise(resolve => w.setTimeout(resolve, 30));
test('new cards preserve original subtitle cleanup and seeders sorting', t => {
  const w = setup(t, card);
  assert.equal(links(w).length, 1);
  const link = links(w)[0];
  assert.equal(query(link), 'Example');
  assert.equal(new URL(link.href).searchParams.get('s'), 'seeders');
  assert.equal(new URL(link.href).hash, '');
  assert.equal(link.parentElement.parentElement.dataset.animeItemTarget, 'footerActionGroup');
  assert.equal(link.target, '_blank');
  assert.match(link.rel, /noopener/);
});
test('legacy cards and notifications still work without style reference nodes', t => {
  const w = setup(t, `<article data-anime-card-list-target="card" data-romaji="Legacy: Subtitle"><div class="anime-card"></div></article><article data-controller="notification"><span>Release Reminders</span><span data-preferred-title-romaji="Old 2nd Season"></span><div><a data-controller="notification-action">Edit</a></div></article>`);
  assert.deepEqual(links(w).map(query), ['Legacy','Old']);
});
test('reminders use structured titles even without progress actions; skip new-anime notices', t => {
  const w = setup(t, reminder() + reminder({schedule:false}));
  assert.equal(links(w).length, 1);
  assert.equal(query(links(w)[0]), 'Romaji');
});
test('malformed action data and absent titles/hosts do not break other items', t => {
  const w = setup(t, reminder().replace(/data-notification-actions='[^']*'/, `data-notification-actions='{'`) + '<article data-anime-card-grid-target="card"></article>' + card);
  assert.deepEqual(links(w).map(query), ['Visible title','Example']);
});
test('links do not bubble into notification read/navigation handlers', t => {
  const w = setup(t, reminder());
  let clicks = 0;
  w.document.querySelector('[data-controller]').addEventListener('click', () => clicks++);
  const event = new w.MouseEvent('click', {bubbles:true, cancelable:true});
  event.preventDefault(); // Avoid navigating the test document.
  links(w)[0].dispatchEvent(event);
  assert.equal(clicks, 0);
});
test('late content, host replacement, title edits, and reinjection stay idempotent', async t => {
  const w = setup(t);
  w.document.body.innerHTML = card;
  await settle(w);
  assert.equal(links(w).length, 1);
  w.document.querySelector('article').setAttribute('data-anime-item-romanized-native-title', 'Updated');
  await settle(w);
  assert.equal(query(links(w)[0]), 'Updated');
  w.document.querySelector('[data-anime-item-target="footerActionGroup"]').innerHTML = '<button>New action</button>';
  await settle(w);
  w.eval(source);
  await settle(w);
  assert.equal(links(w).length, 1);
  assert.equal(query(links(w)[0]), 'Updated');
  w.document.body.innerHTML = reminder(); // Turbo-style navigation
  await settle(w);
  assert.equal(links(w).length, 1);
  assert.equal(query(links(w)[0]), 'Romaji');
});
test('late actions and title text edits are handled', async t => {
  const w = setup(t, reminder().replace('<div data-notification-target="actions"><button>Edit list</button></div>', ''));
  assert.equal(links(w).length, 0);
  w.document.querySelector('[data-controller]').insertAdjacentHTML('beforeend', '<div data-notification-target="actions"></div>');
  await settle(w);
  assert.equal(links(w).length, 1);
  w.document.body.innerHTML = '<article data-anime-card-grid-target="card"><a data-anime-item-target="preferredTitle">Fallback</a></article>';
  await settle(w);
  w.document.querySelector('a').firstChild.data = 'Changed fallback';
  await settle(w);
  assert.equal(query(links(w)[0]), 'Changed fallback');
});
test('countdown ticks leave links untouched and do not cause mutation loops', async t => {
  const w = setup(t, reminder());
  await settle(w);
  let changes = 0;
  const observer = new w.MutationObserver(records => changes += records.length);
  observer.observe(links(w)[0], {attributes:true, childList:true, subtree:true});
  w.document.querySelector('time').textContent = '1s';
  await settle(w);
  assert.equal(changes, 0);
  observer.disconnect();
});
test('manifest references existing runtime files and requests only local preference storage', () => {
  const manifest = JSON.parse(readFileSync('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const script of manifest.content_scripts) for (const path of [...script.js, ...script.css]) assert.ok(readFileSync(path).length);
});

test('chart link sits above synopsis; notification link uses native text-button structure', t => {
  const w = setup(t, card.replace('<div data-anime-item-target="footerActionGroup">', '<div data-anime-item-target="synopsis"><p>Synopsis text</p></div><div data-anime-item-target="footerActionGroup">') + reminder());
  const [chart, notification] = links(w);
  assert.equal(chart.parentElement.parentElement.dataset.animeItemTarget, 'synopsis');
  assert.equal(chart.parentElement.parentElement.firstElementChild, chart.parentElement);
  assert.equal(chart.parentElement.nextElementSibling.textContent, 'Synopsis text');
  assert.ok(notification.classList.contains('lcm3-button--text'));
  assert.equal(notification.querySelector('.lcm3-button__label').textContent, 'Nyaa.si');
  assert.equal(notification.querySelector('[data-action]'), null);
});

test('Explore and My List work without chart-grid attributes', t => {
  const w = setup(t, card.replace('data-anime-card-grid-target="card"', 'data-controller="anime-item" data-anime-item-id="123"'));
  assert.equal(links(w).length, 1);
  assert.equal(w.document.querySelectorAll('.lcef-options').length, 1);
});
test('detail pages keep their own identity separate from related anime cards', t => {
  const w = setup(t, `<div data-controller="anime-details" data-anime-details-id="100" data-anime-details-romanized-native-title="Main show"><div id="external"><a href="https://anilist.co/anime/1">AniList</a></div><article data-controller="anime-item" data-anime-item-id="200" data-anime-item-romanized-native-title="Related show"><div data-anime-item-target="preferredTitle">Related</div></article></div>`);
  assert.equal(links(w).length, 2);
  assert.equal(query(w.document.querySelector('#external [data-lcef-link]')), 'Main show');
  assert.equal(query(w.document.querySelector('article [data-lcef-link]')), 'Related show');
  assert.equal(w.document.querySelector('article .lcef-controls').parentElement.tagName, 'ARTICLE');
});
test('schedule has optional episode search but chart countdowns do not', t => {
  const w = setup(t, `<div data-controller="anime-item" data-timeslot-target="anime" data-anime-item-id="123" data-anime-item-romanized-native-title="Schedule show"><a class="lc-timetable-anime-block__label"><strong>EP5</strong></a></div>` + card);
  const triggers = w.document.querySelectorAll('.lcef-options');
  triggers[0].click();
  assert.match(w.document.querySelector('[data-lcef-menu]').textContent, /Episode 05/);
  assert.ok([...w.document.querySelectorAll('.lcef-menu__search')].some(a => query(a) === 'Schedule show 05'));
  triggers[1].click();
  assert.doesNotMatch(w.document.querySelector('[data-lcef-menu]').textContent, /Episode 05/);
});
test('menu supports English/broad search and Escape restores focus', t => {
  const w = setup(t, card.replace('data-anime-item-romanized-native-title=', 'data-anime-item-english-title="English Name" data-anime-item-romanized-native-title='));
  const trigger=w.document.querySelector('.lcef-options');trigger.click();
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.deepEqual([...w.document.querySelectorAll('.lcef-menu__search')].map(query), ['Example','Example: Season 3 & #2','English Name']);
  w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(w.document.querySelector('[data-lcef-menu]'),null);
  assert.equal(w.document.activeElement,trigger);
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
});
test('preferences save per anime ID and affect all copies; blank title resets', async t => {
  const w=setup(t,card.replace('<article ', '<article data-anime-item-id="123" ') + card.replace('<article ', '<article data-anime-item-id="123" '));
  await settle(w);
  const writes=[];w.chrome.storage.local.set=async values=>writes.push(values);
  w.document.querySelector('.lcef-options').click();
  const panel=w.document.querySelector('[data-lcef-menu]');
  panel.querySelector('input').value='Custom & title';
  panel.querySelector('select').value='id';
  panel.querySelectorAll('input')[1].value='[Group]';
  panel.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await settle(w);
  assert.equal(writes[0]['title:123'],'Custom & title');
  for (const a of links(w)) {
    assert.equal(query(a),'[Group] Custom & title');
    assert.equal(new URL(a.href).searchParams.get('s'),'id');
  }
  assert.match(panel.textContent,/Saved\. The main link/);
  panel.querySelector('input').value='';
  panel.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await settle(w);
  assert.equal(query(links(w)[0]),'[Group] Example');
});
test('storage errors are visible and leave existing search preferences intact',async t=>{
  const w=setup(t,card);await settle(w);
  w.chrome.storage.local.set=async()=>{throw Error('quota');};
  w.document.querySelector('.lcef-options').click();
  const p=w.document.querySelector('[data-lcef-menu]');p.querySelector('select').value='id';
  p.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await settle(w);
  assert.match(p.textContent,/Could not save/);
  assert.equal(new URL(links(w)[0].href).searchParams.get('s'),'seeders');
});
test('removing a card closes its open menu and subsequent insertions still work', async t=>{
  const w=setup(t,card);w.document.querySelector('.lcef-options').click();
  w.document.querySelector('article').remove();await settle(w);
  assert.equal(w.document.querySelector('[data-lcef-menu]'),null);
  w.document.body.innerHTML=card;await settle(w);
  assert.equal(links(w).length,1);
});
test('batch/range/special episode labels are not guessed as single episodes',()=>{
  const {episodeNumber,broadTitle,searchUrl}=require('../scripts/search.js');
  for(const label of ['All 10 EPs','EP1–3','EP1-3','Special','EP1 (Dub)'])assert.equal(episodeNumber(label),'');
  assert.equal(episodeNumber('EP12.5'),'12.5');
  assert.equal(broadTitle('Show 3rd Season Cour 1'),'Show');
  assert.equal(broadTitle('86'),'86');
  assert.equal(new URL(searchUrl('A+B & 日本 #1')).searchParams.get('q'),'A+B & 日本 #1');
});

test('stored preferences load and cross-tab changes refresh existing links',async t=>{
  const w=setup(t,card.replace('<article ', '<article data-anime-item-id="123" '),{sort:'id','title:123':'Remembered'});
  await settle(w);assert.equal(query(links(w)[0]),'Remembered');
  w.document.querySelector('.lcef-options').click();
  w.storageChanged({'title:123':{newValue:'Other tab'},sort:{newValue:'seeders'}},'local');
  assert.equal(query(links(w)[0]),'Other tab');
  assert.ok([...w.document.querySelectorAll('.lcef-menu__search')].some(a=>query(a)==='Other tab'));
});
test('changing a reused card identity closes a stale menu',async t=>{
  const w=setup(t,card);w.document.querySelector('.lcef-options').click();
  w.document.querySelector('article').setAttribute('data-anime-item-romanized-native-title','Different show');
  await settle(w);assert.equal(w.document.querySelector('[data-lcef-menu]'),null);
  assert.equal(query(links(w)[0]),'Different show');
});


test('default queries preserve the original page-specific cleanup rules',()=>{
  const {defaultTitle}=require('../scripts/search.js');
  const cases=[
    ['Rurouni Kenshin -Meiji Kenkaku Romantan- (2023)','Rurouni Kenshin'],
    ['Show 3rd Season','Show'], ['Show Season 3','Show'],
    ['Show: Subtitle','Show: Subtitle'], ['86','86'],
    ['Show Part 2','Show Part 2'], ['Show Cour 2','Show Cour 2'],
    ['Show (2023)','Show (2023)'], ['Show -Subtitle-','Show -Subtitle-']
  ];
  for(const [title,expected] of cases) {
    for(const kind of ['notification','schedule','detail']) assert.equal(defaultTitle(title,kind),expected);
  }
  for(const kind of ['card','compact']) {
    assert.equal(defaultTitle('Show: Subtitle',kind),'Show');
    assert.equal(defaultTitle('Show 3rd Season',kind),'Show 3rd Season');
    assert.equal(defaultTitle('Re:Zero',kind),'Re'); // Exact legacy behavior; full title remains in the menu.
    assert.equal(defaultTitle(': Subtitle',kind),': Subtitle');
  }
  assert.equal(defaultTitle('Season 3','notification'),'Season 3');
});

test('cleaned defaults are labeled honestly and full-title alternatives retain punctuation',t=>{
  const w=setup(t,reminder());
  w.document.querySelector('.lcef-options').click();
  const options=[...w.document.querySelectorAll('.lcef-menu__search')];
  assert.equal(options[0].querySelector('span').textContent,'Default search');
  assert.equal(query(options[0]),'Romaji');
  assert.ok(options.some(a=>query(a)==='Romaji Season 3'));
  assert.ok(options.some(a=>query(a)==='Romaji 05'));
  assert.ok(!options.some(a=>a.textContent.includes('Saved search title')));
  assert.equal(w.document.querySelector('.lcef-menu input').placeholder,'Romaji');
});

test('saved titles bypass cleanup on every page and URL encoding preserves query characters',async t=>{
  const title='A+B & 日本 #1: Season 3';
  const w=setup(t,card.replace('<article ','<article data-anime-item-id="1" ')+reminder(),{'title:1':title});
  await settle(w);
  for(const a of links(w)) {
    assert.equal(query(a),title);
    assert.equal(new URL(a.href).hash,'');
    assert.equal(new URL(a.href).searchParams.size,5);
  }
});


test('resource and footer button rows share native visual modifiers without copying behavior',t=>{
  const neighbor='<a class="lcm3-button lcm3-button--outlined lcm3-button--sm lcm3-button--round w-full selected" data-action="click->site#action" id="original-action" href="https://anilist.co/anime/1">AniList</a>';
  const w=setup(t,'<div data-controller="anime-details" data-anime-details-id="1" data-anime-details-romanized-native-title="Show"><div id="resources">'+neighbor+'</div></div>'+card.replace('<div data-anime-item-target="footerActionGroup"></div>','<div data-anime-item-target="footerActionGroup">'+neighbor.replace('id="original-action"','')+'</div>'));
  for(const a of links(w)) {
    assert.ok(a.classList.contains('lcm3-button--outlined'));
    assert.ok(!a.classList.contains('lcm3-button--text'));
    assert.ok(!a.classList.contains('w-full'));
    assert.ok(!a.classList.contains('selected'));
    assert.equal(a.getAttribute('data-action'),null);
    assert.equal(a.id,'');
    assert.equal(a.parentElement.dataset.lcefStyle,'button');
    assert.equal(a.parentElement.previousElementSibling.textContent,'AniList');
    assert.ok(a.parentElement.querySelector('button').classList.contains('lcm3-button--outlined'));
    assert.equal(a.querySelector('.lcm3-button__label').textContent,'Nyaa.si');
  }
});

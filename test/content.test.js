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
test('manifest references existing runtime files and needs no permissions and starts early', () => {
  const manifest = JSON.parse(readFileSync('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions || [], []);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
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
  assert.equal(w.document.querySelectorAll('.lcef-options').length, 0);
});
test('detail pages keep their own identity separate from related anime cards', t => {
  const w = setup(t, `<div data-controller="anime-details" data-anime-details-id="100" data-anime-details-romanized-native-title="Main show"><div id="external"><a href="https://anilist.co/anime/1">AniList</a></div><article data-controller="anime-item" data-anime-item-id="200" data-anime-item-romanized-native-title="Related show"><div data-anime-item-target="preferredTitle">Related</div></article></div>`);
  assert.equal(links(w).length, 2);
  assert.equal(query(w.document.querySelector('#external [data-lcef-link]')), 'Main show');
  assert.equal(query(w.document.querySelector('article [data-lcef-link]')), 'Related show');
  assert.equal(w.document.querySelector('article .lcef-controls').parentElement.tagName, 'ARTICLE');
});
test('query encoding preserves punctuation and Unicode',()=>{
 const {searchUrl}=require('../scripts/search.js');
 const url=new URL(searchUrl('A+B & 日本 #1'));
 assert.equal(url.searchParams.get('q'),'A+B & 日本 #1');
 assert.equal(url.hash,'');
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
    assert.equal(a.querySelector('.lcm3-button__label').textContent,'Nyaa.si');
  }
});


test('single links replace menus everywhere and schedule retains original title cleanup',t=>{
 const w=setup(t,card+reminder()+'<div data-controller="anime-item" data-timeslot-target="anime" data-anime-item-romanized-native-title="Show Season 3"><strong>EP5</strong></div>');
 assert.equal(links(w).length,3);
 assert.equal(query(links(w)[2]),'Show');
 assert.equal(w.document.querySelectorAll('.lcef-options, [data-lcef-menu], .lcef-controls button').length,0);
});

test('native chart row sits outside synopsis and uses native row and link color classes',async t=>{
 const html=card.replace('<article ', '<article class="lc-anime-details-card" ').replace('<div data-anime-item-target="footerActionGroup"></div>','<div class="lc-anime-details-card__metadata lcm3-text--body-sm" data-action="site#metadata"><div>Novel</div></div><div data-anime-item-target="synopsis" style="padding:8px"><p>Synopsis</p></div>');
 const w=setup(t,html);
 const link=links(w)[0], row=link.parentElement, synopsis=w.document.querySelector('[data-anime-item-target="synopsis"]');
 assert.ok(row.classList.contains('lc-anime-details-card__metadata'));
 assert.ok(link.classList.contains('text-m3-primary'));
 assert.equal(row.getAttribute('data-action'),null);
 assert.equal(row.nextElementSibling,synopsis);
 assert.equal(row.parentElement.dataset.lcefBody,'');
 assert.equal(synopsis.style.padding,'8px');
 synopsis.querySelector('p').textContent='Updated synopsis';
 await settle(w);
 assert.equal(links(w).length,1);
 assert.equal(w.document.querySelectorAll('[data-lcef-body]').length,1);
});

test('unrelated body insertions do not rescan existing cards',async t=>{
 const w=setup(t,card.repeat(40));await settle(w);
 let reads=0;
 for(const item of w.document.querySelectorAll('article')) {
  const original=item.getAttribute.bind(item);
  item.getAttribute=(name)=>{reads++;return original(name);};
 }
 w.document.body.append(w.document.createElement('aside'));
 await settle(w);
 assert.equal(reads,0);
 w.document.body.insertAdjacentHTML('beforeend',card);
 await settle(w);
 assert.equal(links(w).length,41);
 assert.equal(reads,0);
});

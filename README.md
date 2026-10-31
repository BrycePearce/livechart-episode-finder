# LiveChart Episode Finder

Manifest V3 extension adding one-click Nyaa searches and a small search-options menu to LiveChart.

## Install / update

1. Extract `livechart-episode-finder-0.3.2.zip` into a permanent folder, or use this repository folder.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`.
3. For an existing unpacked installation, replace its files and click **Reload**. Disable any separately loaded older copy.
4. Refresh open LiveChart tabs.

No build or npm installation is needed to use the extension. Runtime files are `manifest.json`, `scripts/search.js`, `scripts/content.js`, and `scripts/content.css`.

Version 0.3.0 adds Chrome's `storage` permission for local preferences. No additional site access is required.

## Supported views

- Seasonal charts, including the redesigned TV chart.
- My List and Explore anime results using the shared anime-item cards.
- Compact anime cards, including related anime.
- Release schedule entries.
- Individual anime Info pages, beside the external resources.
- Release reminder notifications, including category filters and pagination. New-anime notices are excluded.
- Legacy chart/reminder markup remains supported as a fallback.

Detail cards show a compact row above the synopsis, scrolling with that area. Compact cards get controls below their content. Schedule entries get a small action row. Notifications use LiveChart's native text-button styling. When inserting into a native button row, the controls adopt neighboring buttons' size, shape, and visual variant (including outlined resource buttons), without copying site actions or state. An adjacent arrow opens a top-layer popover so scrolling cards do not clip the menu.

## Search options

The main **Nyaa.si** link preserves the original search defaults, using the romanized title (English/displayed title if unavailable). Chart and compact cards remove the colon subtitle. Notifications remove numbered season phrases and the original hyphenated-subtitle-plus-year pattern; schedule and detail pages use that same cleanup. Empty cleanup results fall back to the full title. Saved per-anime overrides take priority and are never shortened. Query characters such as `&`, `#`, `+`, and Unicode are safely encoded. Searches still default to most seeders.

These are heuristics, not guaranteed matches: the original chart rule also shortens names such as `Re:Zero` to `Re`. Use the full-title option or save a better title for that anime when needed.

The arrow offers:

- **Default search**: the original cleanup, shown when it differs from the full title.
- **Saved search title**: your explicit override, when set.
- **Full title**: the original LiveChart title.
- **Broader series**: an explicit shortened alternative when one can be derived by removing a colon subtitle or trailing numbered season/cour/part. This is heuristic and never silently replaces the main query.
- **English title**: when LiveChart supplies a different English title.
- **Episode**: only for a single explicit `EP` number on a reminder or schedule entry. Batch/range/special labels are not guessed. Numbering can differ between releases.
- **Search title for this anime**: saved by LiveChart anime ID, shared across all appearances of that anime. Clear it to restore the default cleanup. Disabled when a reliable ID is unavailable.
- **Sort all searches by**: most seeders (default), or newest first.
- **Release group**: optional text prepended to every search.

Click **Save preferences** to apply changes. Full-title and broad/English alternatives use the saved sort and release-group choices too. Escape closes the menu and returns focus to its arrow. Clicking outside dismisses it.

## Privacy and behavior

Preferences are stored in `chrome.storage.local` in this browser profile, not in LiveChart's storage or a remote service. No background worker, tracking, downloads, or requests to Nyaa occur automatically. Search text is sent to Nyaa only when you open a search link. The extension never changes your list or marks a notification read when you use its controls.

Dynamic content, replacement cards, and client-side navigation are handled without duplicate controls. Countdown ticks are ignored. Missing/partial data is skipped and retried when the markup changes. Future structural redesigns can still require adapter updates.

## Development

Node.js 22.12+ (tested with Node 26):

```sh
npm ci
npm test
node --check scripts/content.js
node --check scripts/search.js
```

The 24 DOM/unit checks use synthetic fixtures with no account information. They cover original search cleanup parity, override priority, page adapters, legacy markup, query encoding, dynamic updates, idempotence, click propagation, menu focus/closing, per-anime preferences, storage failures, and cross-tab updates.

For a visual preview, run a local web server from this folder and open `test/preview/index.html`. The preview uses synthetic examples, LiveChart's public stylesheet, a small set of mirrored component grid rules, and a preview-only localStorage shim. It is not included in the extension ZIP. The preview was checked at desktop and 390px widths, including menu interaction and persistence across reloads.

Live chart, notification, My List, Explore, schedule, and anime-detail markup was inspected on October 30, 2026. A final smoke test with the extension actually installed in Chrome is still recommended: test the main link, menu, keyboard use, notification read state, and the layouts/themes you use. The preview does not reproduce every page component or alternate list layout.

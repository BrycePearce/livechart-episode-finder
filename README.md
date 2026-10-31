# LiveChart Episode Finder

Adds a single Nyaa.si link to LiveChart charts, lists, schedules, anime details, and release reminders. No dropdown, settings, or extra permissions.

## Install / update

Load this folder with Chrome's **Load unpacked**, or extract the ZIP and select the folder containing manifest.json. For an existing installation, click **Reload** in chrome://extensions and refresh LiveChart tabs.

## Behavior

Chart links reuse the native metadata-row classes outside the padded synopsis, with LiveChart’s primary link color. The synopsis keeps its own scrolling area. Notifications and resource rows use native button styling alongside existing actions.

Searches preserve the original page-specific defaults: chart cards remove colon subtitles; notifications remove numbered season phrases and the original hyphenated-subtitle/year pattern. Schedule and detail pages use notification cleanup. Romanized titles are preferred, with English/displayed-title fallbacks. Empty cleanup results fall back to the full title. Searches sort by seeders and safely encode special characters. Earlier menu preferences are no longer used.

The extension starts at document_start, handles newly inserted and updated content, and ignores countdown ticks and unrelated container changes. No automatic requests to Nyaa or changes to your LiveChart account occur.

## Development

Run npm ci and npm test. Tests use synthetic fixtures. The test/preview page is a synthetic layout aid, not an exact replica of every LiveChart page.

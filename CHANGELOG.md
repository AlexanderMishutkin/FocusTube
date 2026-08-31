# Changelog

All notable project-facing changes are documented here.

## [2.3.0-fork.1] - 2026-08-31

- Fixed: the blocking overlay was never created. `UI.create()` referenced a
  variable whose declaration had been removed with the icon change, so the
  call threw and no overlay appeared on any platform, in strict or warn. This
  is the bug that made 2.3.0-fork look like it did nothing.
- Fixed: the inline badge was not the FocusTube logo. It is now drawn from
  measurements taken off this fork's own green `icons/icon128.png`.
- Instagram no longer treats any short-text button in a post header as a
  follow control, so an ordinary post cannot be hidden by an unrelated
  button.
- LinkedIn scopes the follow-control search to the outer post. Resharing
  somebody you are not connected to no longer hides the post of the person
  you follow who reshared it.
- Cached classifications are retired when a control paints late or when a
  feed element is recycled for a different post.
- Collapsed posts have their video and audio paused instead of being hidden
  while still playing.
- Both feed filters ship on in this fork. Upstream ships them off.
- Added `test/`: 146 assertions across the badge, Instagram and LinkedIn.

## [2.3.0-fork] - 2026-08-30

Fork of FocusTube by malekwael229, maintained by Aleksandr Mishutkin.

- Added Instagram feed filtering: posts from accounts you do not follow, and
  sponsored posts, are replaced by a placeholder block. Offered upstream as
  [PR #11](https://github.com/malekwael229/FocusTube/pull/11).
- Added the same for LinkedIn: posts from outside your network, and promoted
  posts.
- Content scripts no longer build `chrome-extension://` URLs for their icons,
  which removed a stream of `net::ERR_FAILED` console errors after any reload
  of the unpacked build.
- Rebranded this fork: name, green accent colour, and icons. Links in the
  popup and options page point at the fork; the About section credits the
  original project.

## [Unreleased]

No unreleased changes yet.

## [2.3.0] - 2026-08-04

- Added a separate YouTube setting to hide the English "Most relevant" shelf on the Subscriptions page, including late-loaded shelves.
- Tightened Facebook Strict and Warn blocking so it applies only to `/reel` and `/reels` routes; normal Facebook pages remain accessible.
- Replaced broad Facebook Reels-shelf hiding with targeted Reels navigation, Stories, and People You Might Know hiding.
- Added the Facebook Stories and People You Might Know controls to the popup and options page.
- Hardened Warn-mode media recovery so the interstitial pauses page media and resumes only one visible video after "Watch Anyway."
- Removed Facebook-specific automatic audio handling so Facebook's native mute controls remain authoritative after "Watch Anyway."
- Removed the YouTube Warn-mode play-all fallback that could restart hidden players after the overlay was dismissed.
- Hardened timer/stat lifecycle handling, import validation, tab messaging, and detached DOM tracking without adding permissions or telemetry.
- Added regression and browser smoke coverage for route boundaries, dynamic hiding, settings persistence, and media recovery.

## [2.2.0] - 2026-05-10

- Refined repository documentation for clearer cross-browser installation and privacy expectations.
- Added contributor, security, and store listing notes for project maintenance.
- Updated manifest icon metadata to use the existing icon sizes.
- Removed the unstable in-feed Instagram Reels hiding option while keeping Reels/Explore path blocking and Reels navigation hiding.
- Added explicit extension-page CSP declarations for Chromium and Firefox manifests.
- Split content script manifest entries so each supported site receives only the shared script and its own platform script.
- Removed the unused packaged `icons/icon.png` asset.
- Fixed TikTok warn mode so "Watch Anyway" opens the allow window before the overlay is removed.
- Kept TikTok warn allow windows page-local so a refresh shows the warning again.
- Restored audible TikTok playback after choosing "Watch Anyway."
- Added warn mode support for Instagram Reels and Explore pages.
- Kept Instagram warn mode allowed until page refresh after choosing "Watch Anyway."
- Resumed Instagram video playback where the page allows it after choosing "Watch Anyway."
- Fixed the popup mode picker so Instagram warn mode can be selected.
- Added a Facebook setting to hide Reels shelves in the feed.
- Improved Facebook Reels shelf hiding to target the full feed shelf/card.
- Guarded extension image URL lookups so stale content scripts do not throw after extension reloads.
- Centered popup menu toggle knobs.

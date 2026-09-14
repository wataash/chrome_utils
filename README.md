<!--
SPDX-FileCopyrightText: Copyright (c) 2026 Wataru Ashihara <wataash0607@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Chrome Utils

A Manifest V3 Chrome extension with small improvements for individual websites.

## Features

- Switch YouTube quality to Auto or 144p–4320p from the extension popup.
- Read YouTube video titles aloud at the start and end of playback.
- Copy all Genius lyrics when no text is selected.
- Set Songsterr key signatures and enable the Tab/Sheet selector locally.

Click the extension icon to open the popup. Settings for the active website expand
automatically and appear first; other websites stay collapsed in alphabetical order. Click a website heading to expand
or collapse its settings. The title announcement and lyrics
copy features can be toggled individually; changes apply to open pages immediately.

### Genius lyrics copying

With this feature enabled, press `Ctrl+C` (`⌘C` on macOS) with nothing selected
to copy text from all `data-lyrics-container="true"` elements. A brief
“Lyrics copied to clipboard” notification appears at the bottom of the page.
Headings such as the song title are excluded, keeping ads and recommendations
out of the copied lyrics. Copying selected text or text in an input field retains
the browser's normal behavior.

### YouTube title announcements

Enabled by default. On regular YouTube video pages, the extension announces the
title once it has remained stable for about a second after playback begins,
including when a playlist advances. It also announces the title when the video
ends, before the next video's opening announcement.

Skipping to another video does not trigger an ending announcement. Resuming
paused playback does not repeat the title, and announcements wait during ads.
The full video title is used, including artist names; song names are not inferred.
Non-music videos are also supported. YouTube Music and Shorts are not supported.

Announcements use Chrome TTS and require an available speech engine. Voices and
pronunciation depend on your environment. The extension does not change the music volume.

### YouTube quality controls

Pin Chrome Utils to the toolbar. On a YouTube video tab, click the extension icon,
then Auto / 144p / 240p / … to change quality in two clicks. Unavailable quality
levels show an error without selecting a different level. English and Japanese
YouTube interfaces are supported. Quality cannot be changed during ads.

The extension operates YouTube's quality menu and verifies the selected option.
It applies to the current video; it does not force or reapply the setting on the
next video. Whether the setting carries over depends on YouTube. Already loaded
video data is unaffected. Changes to YouTube's menu structure may require updates.

Clicking a quality button loads the required script into the active video tab.
This also works on tabs opened before an extension update, without reloading the
page. It uses the `activeTab` and `scripting` permissions and makes no external
network requests.

### Songsterr key signatures

Open a Songsterr tab, then open the Chrome Utils popup. The **Songsterr** section
shows the key signature controls directly. They target an active Songsterr tab, or the first available
Songsterr tab if none is active.

- **Enabled** toggles key signature injection.
- Choose a key from seven flats to seven sharps, and major or minor mode.
- **Only this song** saves an override for the current song. Otherwise, saving
  updates the default and removes the current song's override.
- **Save and reload** applies the setting and reloads the target tab.
- **Clear all song overrides** removes per-song settings but keeps the default.

The default is three sharps (A major). The extension patches fetched track data
locally to add a key signature to each measure for Sheet view. It also patches
the initial `guit_bass_st_not` experiment state to enable the Tab/Sheet selector.
It does not upload changes to Songsterr. Support depends on Songsterr's current
page structure, track format, and rendering behavior.

Settings use Songsterr's local storage keys `songsterr-keysig` and `songsterr-exp`.
Existing settings from the standalone extension carry over in the same browser
profile. To disable the selector override, set `songsterr-exp` to
`{"disabled":true}` in the site's local storage and reload.

When migrating from Songsterr Key Signature Injector, disable or remove that
extension, reload Chrome Utils, and reload Songsterr. Running both extensions
would patch the same page twice. Chrome Utils requires access to
`https://www.songsterr.com/*` to initialize the page at document start and to
read and write its settings.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the cloned repository directory.

After updating an installed copy, click its reload button on the extensions page
and reload the relevant website tabs. Quality controls can initialize themselves
without a website reload.

## Structure

Add site-specific features under `features/<site>/`. The `content_scripts` entries
in `manifest.json` scope automatically loaded CSS and JavaScript to their target
sites. YouTube quality controls are loaded on demand from the popup.
Shared feature names and setting keys belong in `shared/features.js`.

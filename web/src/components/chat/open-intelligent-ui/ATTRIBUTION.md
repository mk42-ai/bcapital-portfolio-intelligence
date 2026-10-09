# Attribution

The chat shell on `/chat` follows the **Open Intelligent UI** reference implementation by Thesys
(https://github.com/thesysdev/open-intelligent-ui, commit `3b39c06b954e87c394ef95fee41a7e0084f94a27`,
package `openui-self-hosted` 0.1.1, 2026-10-09). That repository is *private: true* and not published to npm, and it
carries no LICENSE file, so only two small presentation files were vendored here with light edits:

- `shell.css` — the `.chat-shell` overrides for `AgentInterface` (original: `src/app/shell.css`)
- `response-theme.ts` / `response-theme.css` — the neutral light `createTheme` palette (original: `src/lib/response-theme.ts`, `src/lib/response-theme.css`)

Everything travel-specific (TravelMap/MapLibre, TravelGallery, TravelItinerary, the OpenUI Gateway `/api/chat`
route and `generated/spec.json`) was NOT copied. The runtime components come from the MIT-licensed OpenUI packages
`@openuidev/react-ui` 0.17.0, `@openuidev/react-headless` 0.17.0 and `@openuidev/react-lang` 0.3.2
(Copyright (c) 2011-2024 Thesys Inc.) — see `node_modules/@openuidev/react-ui/LICENSE`.

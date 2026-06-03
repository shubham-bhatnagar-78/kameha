# kameha

**Goku lives on your desktop.**

A tiny menu-bar app that puts a fully interactive Dragon Ball Z Goku sprite on your screen. Hold to charge. Release to blast. Double-click to vanish.

<img src="assets/goku_sheet.png" alt="Goku sprite — idle, charge, fire" width="320" />

---

## Install

```bash
git clone https://github.com/shubham-bhatnagar-78/kameha
cd kameha
npm install
npm start
```

Goku appears in your menu bar immediately. Click the icon to summon him.

---

## Controls

| Action | What happens |
|--------|-------------|
| **Click anywhere** | Fire a quick kamehameha beam |
| **Hold mouse button** | Charge up — the longer you hold, the bigger the blast |
| **Release after charging** | Unleash the full kamehameha |
| **Double-click Goku** | Instant Transmission — he vanishes in a white flash |
| **Escape** | Hide Goku |

Goku follows your cursor. The charge bar shows how much power you've built up. Charging past 70% triggers his cupped-hands pose and shakes the screen.

---

## How it works

kameha is an [Electron](https://www.electronjs.org/) app that renders a transparent, always-on-top, click-through overlay over your entire screen. The overlay uses the Canvas API to:

- Animate Goku from a 3-frame sprite sheet (idle → charge → fire)
- Procedurally draw the kamehameha beam with layered radial gradients
- Spawn ki particle bursts on impact
- Crossfade between animation poses for smooth transitions
- Play positional audio for charge wind-up, beam fire, and instant transmission

The tray icon extracts and alpha-keys the DBZ logo from the source image at startup — no pre-processed icon file needed.

---

## Platform support

| Platform | Status |
|----------|--------|
| **macOS** | First-class. First launch may prompt for Accessibility permission (needed for focus restore after tray click). |
| **Windows** | Works via Electron. Native refocus requires the optional `koffi` dep (auto-installed when available). |
| **Linux** | Works on X11. Wayland + GNOME tray support is flaky (known Electron limitation). |

---

## Disclaimer

kameha is an unofficial fan project. Goku, Dragon Ball, and all related marks are property of Bird Studio / Shueisha / Toei Animation. This project has no affiliation with Toei Animation or any rights holder.

## License

MIT

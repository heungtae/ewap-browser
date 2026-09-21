# Collection Reading fixtures

Run the fixture server from the repository root:

```bash
scripts/run-examples.sh collection-reading-demo
```

It serves this directory at `http://127.0.0.1:3000/`.

| Page                       | Controlled condition                                        | Current expected boundary                                             |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `static-table.html`        | 25 stable rows already in the DOM                           | `complete` static read                                                |
| `list.html`                | 15 stable ARIA options already in the DOM                   | `complete` static read                                                |
| `virtual-scroll-grid.html` | 1,000 logical rows, but only a recycled viewport is mounted | `unavailable`; no virtual-scroll protocol yet                         |
| `pagination.html`          | 100 logical rows behind local page controls                 | `unavailable`; no reviewed page-transition contract                   |
| `svg-chart.html`           | visual chart plus an accessible companion table             | chart is currently unavailable; its table is a separate candidate     |
| `canvas-chart.html`        | canvas pixels plus a separate table                         | currently unavailable; any future visual read stays `viewport_only`   |
| `mixed-collections.html`   | several discoverable candidates                             | selection is explicit; no automatic merge                             |
| `collection-fixture.html`  | table-shaped local adapter boundary                         | localhost does not satisfy a reviewed adapter's exact-origin contract |

These are fixture observations, not provider or production E2E evidence. For a browser run after extension changes, rebuild the extension, reload the unpacked extension, reload the target fixture page, and reopen the Side Panel.

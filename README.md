<p align="center"><strong>ContextPilot</strong> is a local-first Chrome extension for asking questions about web pages and carrying out browser tasks.</p>
<p align="center">
  <img src="extension/assets/icons/contextpilot-128.png" alt="ContextPilot" width="96" />
</p>
<p align="center">
  Bring your own model provider. Open the side panel on a web page, choose <strong>Ask</strong> or <strong>Act</strong>, and follow the consent and review prompts.<br />
  <a href="https://heungtae.github.io/ewap-browser/en/">English documentation</a> · <a href="https://heungtae.github.io/ewap-browser/ko/">한국어 문서</a>
</p>

---

## Quickstart

### Installing and running ContextPilot

Use Chrome 116 or later, Node.js 20 or later, and the pinned `pnpm@9.15.4`. From a clone of this repository, install dependencies and build without changing the extension version:

```shell
corepack enable
pnpm install --frozen-lockfile
pnpm exec tsc -p tsconfig.build.json
node scripts/build-extension.mjs
pnpm validate:package
```

This creates a development build with unmasked diagnostic logs. Use
`node scripts/build-extension.mjs --release` for masked release diagnostics;
`pnpm build:release` also increments the extension version.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose this repository's `dist-extension/` folder.
3. Open the extension's **Settings**, configure your provider endpoint, model, and authentication, then save and test the connection.
4. Open ContextPilot's side panel on a web page and send an **Ask** or **Act** request.

<details>
<summary>Creating a local ZIP and updating an installation</summary>

Build with `node scripts/build-extension.mjs --release`, then run `pnpm package:local` to create `dist/contextpilot-<version>.zip`. Packaging rejects unmasked development builds. Extract the ZIP into a stable folder and load that folder as an unpacked extension. Close Chrome and back up the folder before replacing its contents for an update or rollback.

See the [installation guide](docs/site/en/index.html#installation) for details. Local packaging does not publish to the Chrome Web Store.

</details>

### Connecting your model provider

ContextPilot uses the provider you configure in Settings. Select the matching plugin and wire API, enter the endpoint and model, and supply authentication if your provider requires it. HTTP and private-network endpoints need the corresponding access permissions.

Local-first does not mean every request stays on your computer: approved page context is sent to your selected provider. Review the consent prompts before sharing page content, source code, or screenshots.

## Docs

- [**User documentation — English / 한국어**](https://heungtae.github.io/ewap-browser/)
- [**User documentation in this repository**](docs/site/README.md)
- [**Installing, updating, and recovery**](docs/community-installation.md)
- [**Building and testing**](docs/test.md)
- [**Source guide**](docs/source-guide.md)
- [**Contributing**](AGENTS.md)
- [**Verification evidence and limitations**](docs/evidence/README.md)
- [**All repository documents**](docs/README.md)

The implementation, runtime contracts, and configuration define current behavior. Dated evidence applies only to its recorded revision and environment. `pnpm build` and `pnpm test` increment the extension version; the Quickstart commands preserve it.

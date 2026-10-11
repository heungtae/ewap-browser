# Bilingual user documentation

The public user guide is a dependency-free static site. English and Korean have
matching section IDs, so the language switch preserves the current section.
The landing page uses the saved language choice, then the browser language
(Korean or English). Direct language URLs stay in their requested language.
With JavaScript disabled, both guides and their language links remain usable.

- [English](en/index.html)
- [한국어](ko/index.html)
- Expected Pages URL: <https://heungtae.github.io/ewap-browser/>

## Preview locally

From the repository root:

```shell
python3 -m http.server 8000 --directory docs/site
```

Open <http://localhost:8000/>. No extension build or version bump is needed.

## Publish to GitHub Pages

In repository **Settings → Pages → Build and deployment**, select **GitHub
Actions** as the source. Commit the site and
[Pages workflow](../../.github/workflows/docs-pages.yml) to `master`, then push.
The workflow publishes only `docs/site/`; it does not upload internal evidence,
provider configuration, or the rest of the repository. You can also run
**User documentation** manually from Actions on `master`.

Publication is complete only after the Pages deployment succeeds and the public
URL is checked. Adding these files locally does not activate Pages.

## Maintain the guides

Edit `en/index.html` and `ko/index.html` together. Keep section IDs aligned and
use relative links for site assets so project Pages paths and local previews
both work. Shared presentation and language behavior live in `assets/`.
No third-party scripts, fonts, or analytics are loaded.

User instructions must follow the current manifest, Settings UI, and executable
commands. Keep detailed source navigation, developer tests, and dated evidence
in the existing [repository documentation](../README.md).

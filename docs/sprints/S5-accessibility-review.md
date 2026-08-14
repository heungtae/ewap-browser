# S5 operational panel accessibility review

| Control | Accessibility contract |
|---|---|
| Ask/Act | native buttons, disabled Act on an ineligible origin/profile, active state uses text plus visual state |
| confirmation | native Confirm button inside an `aria-live` state region; profile/confirmation IDs are not raw business data |
| Stop | native button; result is announced through `aria-live` and reports detach success/attention |
| audit timeline | semantic `details`, `summary` and ordered list; only redacted fields render |

The review is source-backed by `company-panel.js` and `control-panel-contract.test.mjs`. A managed Chrome assistive-technology run remains a production GO requirement and is recorded in RC1's NO-GO release decision.

# Browser console evidence

## Product-origin messages

- Warning on `/` after the synthetic-source selector changed the hero preview:
  `/marketing/signal-journey/wechat-synthetic.webp` and
  `/marketing/signal-journey/whatsapp-synthetic.webp` were detected as LCP
  images without eager loading.
- Warning on `/blog` at `2026-09-03T10:17:52.175Z`:
  `/images/blog/current-dependency.webp` was detected as the LCP image without
  eager loading.
- No product-origin browser `error` message was observed in the exercised
  public, auth, boundary-fixture, Today, People, Evals, or Lab pages.

## Excluded harness messages

Chrome-extension `handleHistoryStateUpdate` and Tiptap duplicate-extension
messages came from the browser-control/notes extensions, not from a Talent
Signal origin, and are excluded from product findings.

## Server-side authentication evidence

Calling Auth.js's raw `/api/auth/signout` page directly produced a
`MissingCSRF` error and is not treated as the product logout path. The product
path was tested through the visible workspace `退出登录` control. Before the
bounded-backend-logout correction, it remained on Today for more than five
seconds; after the correction it returned to `/` inside the 2.6 second
observation window.

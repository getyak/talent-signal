# r39 login A/B visual review

**Recommendation: choose A for desktop and its single-column adaptation for mobile.** A explains why returning matters—People, conversations and context continue across devices—while keeping the actual login form clear. B is coherent and slightly more singular in focus, but its centered form could belong to almost any service. Do not add more illustration, cards, gradients or motion to A.

The direction is **pass with changes**, not production acceptance. The later raw mobile-light viewport capture is visually sound and closes the initial capture discrepancy for this prototype. HTML/CSS did not change; this is an evidence correction, not a claim that a product layout bug was fixed. Typography and duplicate-copy changes remain below.

## Review scope and method

- Reviewer: `mobile-ux-reviewer`, using `design-talent-signal`.
- Lens: login clarity, relationship continuity, restrained craft, readable controls and visible recovery.
- Surface: the entry threshold to the desktop knowledge workspace, adapted to a returning user's phone. User question: “How do I get back to my people and conversations?”
- Character: neutral, composed and editorial; low visual variance, no needed decorative motion, moderate form density.
- Canonical meaning: one signed-in account owns People and Sessions. The device diagram is an explanatory view, not proof of a current sync result. The email-conflict block is a recovery state, not permission to merge or link identities.
- Evidence level: **3 — screenshots plus implementation code**. Confidence: **supported inference**. No browser, native app, tap, keyboard, screen reader, login or backend action was executed.
- All six initial requested screenshots and the follow-up `a-mobile-light-r3.png` were actually opened with `view_image`: A desktop light/dark, B desktop light, A mobile light/dark/conflict. Desktop A is 1280×903; mobile captures are 390 pixels wide. The final light viewport is 390×844; the initial normal captures are 857 high and the conflict capture is 965 high. `index.html` and `style.css` were subsequently read to locate typography and target-size changes; that source read is not substituted for rendered evidence.
- The design-system reference is `/Users/cubxxw/data/talent-signal-account-sync/docs/design-system.md`, especially quiet neutrals, relationship continuity, hierarchy before framing, readable metadata and visible recovery. Product, project and reviewer context were also read.

## The five frozen criteria

| Criterion | A | B | Decision |
| --- | --- | --- | --- |
| Login action is apparent within five seconds | The right-hand heading, provider controls and solid login button form a clear task region. The left headline is larger but does not masquerade as an action. | The single centered column has the clearest immediate focal point. | Both work in the desktop renders. This is a reviewer impression, not a timed user study. |
| Quiet neutral character and relationship continuity | Warm near-white/graphite, restrained lines and an explanatory device row support the product promise. Dark mode retains the hierarchy without glow or added decoration. | Equally restrained, but communicates less continuity. | A better fits this specific task. |
| Product meaning after removing the logo | “换个屏幕，继续上次的对话” plus contacts/context/device labels still describe the user's ongoing work. | “工作台” and “重要的人与对话” provide some meaning, but the composition is more generic. | A wins the conceptual logo-off comparison; no modified logo-off image was generated. |
| Input and recovery remain primary | Form grouping stays separate from the narrative. The mobile conflict block sits before the available methods and uses text plus a restrained red seam. | Slightly less competing content. No B error/mobile render was supplied. | A is sufficient; remove redundant prose rather than redesigning the form. |
| Readability, targets and narrow long-error content | Desktop and final mobile-light/dark/conflict are orderly; conflict text wraps without visible clipping at 390 px. Labels and status text are too small. Initial light capture failure is superseded by the separately preserved raw viewport readback. | Desktop shares the same small type; mobile/dark/error states were not inspected for B. | Requires the bounded typography/target corrections below. |

## Evidence correction and required small changes

### 1. Mobile-light capture discrepancy: visually closed by the raw viewport readback

**Artifact:** `a-mobile-light.png`, SHA256 `1cef67a55fe57e2d18e2f27736cf2bc6c6a9be83f106a71c905aed23c3a9b462`.

At 390 px, the supplied light screenshot collapses the page into a narrow left strip: the title runs nearly one Chinese character per line, the brand and preview navigation wrap vertically, and the Apple button is only about a quarter of the viewport width. The email/password fields and login action are below the captured viewport. This defeats both immediate comprehension and usable login.

The current stylesheet includes a full-width single-column mobile rule, and the same-width dark/conflict screenshots are normal. The initial image therefore showed a **failed captured artifact**; it did not establish a current product CSS cause.

**Final visual readback:** I opened `a-mobile-light-r3.png`, SHA256 `3dff0082c4be518bc49700955197ed1056eb038e90dfb24ed16296d01180b987`, a 390×844 raw viewport PNG. The brand and heading wrap normally; provider controls, both fields, login button and create-account link occupy the expected single column and are visible. The parent reports the same tab's live DOM measurements as viewport 390 px, entry 342 px and document width 390 px; I did not independently operate that DOM. The final screenshot itself supports the corrected visual conclusion.

The parent obtained this separate image using documented CDP `Page.captureScreenshot(format=png, captureBeyondViewport=false)` after the earlier full-page capture anomaly and a reported blank second capture. All artifacts remain preserved. HTML and CSS hashes remained identical before/after, and no source change was made. Do not call this a product layout repair or assert a specific capture-tool root cause. The initial failed artifact is not retroactively passed. The eventual production page still needs its own final rendered acceptance.

### 2. Raise actionable and recovery type; retain the existing generous control heights

**Artifacts:** all desktop renders; especially `a-mobile-dark.png` and `a-mobile-conflict.png`.

Provider labels look noticeably small inside otherwise comfortable buttons. The conflict notice is legible in the capture but unnecessarily compressed for the sentence that tells the user how to recover. Source confirms provider text at 13 px, field labels and conflict notice at 12 px, and the sync line at 11 px.

**Correction:** use 14–15 px provider/primary-action text, 13–14 px field labels, and at least 14 px conflict/recovery prose with roughly 1.6 line height. Keep the actual input text at 16 px. Keep 48–50 px primary controls and the existing 44 px password-reveal target. If the sync sentence remains, give it at least 13 px rather than squeezing it into tiny metadata. The retained theme control is 40×40 in source; expand its hit box to at least 44×44 without making the glyph larger.

**Verification:** repeat light/dark, narrow conflict text and enlarged-text renders. The conflict may make the page taller; preserve scrolling rather than shrinking copy or hiding an action. The 965 px conflict capture is taller than a typical visible mobile viewport, so it proves wrapping, not keyboard/scroll reachability.

### 3. Remove repeated reassurance and study controls from the shipped surface

**Artifacts:** A desktop light/dark and mobile dark/conflict.

A already explains continuity in the left headline and supporting paragraph. “从上次停下的地方，接着开始。” repeats the headline instead of adding a decision. The form's sync line and bottom privacy sentence add more small reassurance below the task. This is a subjective craft deduction, not a functional failure.

**Correction:** remove the repeated “从上次停下的地方，接着开始。” line. Keep no more than one compact account-continuity sentence near the form; if the form-bottom sentence is removed, do not replace it with another footer slogan. In production retain a genuine home/brand return and theme control; omit A/B links, the conflict-preview button and the preview disclaimer. Those controls are appropriate to this study and are not themselves prototype defects. Removing them also gives the mobile header comfortable room.

**Verification:** capture the production composition without study chrome. The form should retain the same scan order and avoid an unexplained empty footer region. No extra hero illustration or animation is needed.

## Recovery and product-truth boundaries

The red conflict seam is used for a meaningful recovery state rather than decoration. Its title and explanatory text communicate more than color alone, and the original-account wording avoids implying an automatic merge. Preserve that hierarchy.

The screenshots do **not** prove that “use the original method, then bind in Settings” is actionable or authorized. In the real state, the available methods and any existing account-recovery route must lead somewhere usable; do not add a dummy recovery link or expose an account's provider details from unverified email input. Only show this particular conflict message for the corresponding authoritative error, not for cancellation, network loss or an unknown result. The prototype intentionally routes controls to a preview notice; that is not evaluated as a working authentication flow.

Likewise, “同一账号，联系人与会话自动同步” is a product promise, not a displayed successful sync receipt. Publishing it requires the separate identity and synchronization acceptance already owned by the parent task. This visual review proves neither email-conflict security nor password/provider completion, account linking, permissions, persistence, session synchronization, privacy claims or release readiness.

Keyboard focus, VoiceOver order/names, effective tap targets, zoom, contrast conformance, reduced motion, slow/offline/pending states and actual recovery remain unverified. The source's labels, focus outline and target dimensions are useful implementation cues only. No additional authentication action or outside permission is requested by this design choice.

## Evidence hashes

The hashes below bind the files actually reviewed. The initial failed light image and the final valid raw viewport are separately recorded; the initial image is not retroactively passed. The reported blank r2 artifact was not independently viewed and is not used as visual evidence here.

| Artifact | SHA256 |
| --- | --- |
| `index.html` | `1e53cee0adfe16d0721e696411734de266bd86047e637d5eff50025c1f99724d` |
| `style.css` | `c4e6d16696031f0962ce1e7eeeccb023e521348d0e0f9ecc878aa1fac5572b74` |
| `a-desktop-light.png` | `d65528cc4e2ff38d5444f81a513f4901b76ec34eae924c36a8ecc0406eab41f3` |
| `b-desktop-light.png` | `bace103940a0fb5fe5d779eb257014beb969dfbe56401d6bf2ef47ef90430dbc` |
| `a-desktop-dark.png` | `44feb844185d4698dca537fbbdc94cf970b0badcf2b12b2678c576f8e8aec13d` |
| `a-mobile-light.png` | `1cef67a55fe57e2d18e2f27736cf2bc6c6a9be83f106a71c905aed23c3a9b462` |
| `a-mobile-light-r3.png` | `3dff0082c4be518bc49700955197ed1056eb038e90dfb24ed16296d01180b987` |
| `a-mobile-dark.png` | `af5dc69fba01bc5ba4a823ac827fdd9b37e804ebf6dbea622ddb77290bd509d1` |
| `a-mobile-conflict.png` | `fc225aad4c0bfb404b9fc3645c83957a762e3e652c29f5779d180d486f6f47ee` |

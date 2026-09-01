# Candidate Follow-up Companion field trial

## Purpose

Use 5–8 authorized recruiter sessions to test one outcome: whether a recruiter
can move from one deliberately selected conversation to an adopted draft or a
verified reminder in under one minute. This is product-usefulness evidence,
not a release score.

## Privacy boundary

- The recruiter chooses a work fragment they are authorized to use and keeps
  its text, screenshot, identities, draft, and destination on their Mac.
- The observer does not collect the conversation, candidate or client name,
  relationship identifiers, generated draft, reminder title, or EventKit ID.
- External effects require the recruiter's exact preview and approval. A copied
  or opened draft is not treated as sent.
- Stop the session if the participant cannot authorize the source or effect.

## One session

1. Start with a real post-conversation follow-up the recruiter would otherwise
   complete now.
2. The recruiter invokes Talent Signal from their chosen text, screenshot, or
   document and reviews `What changed`, exact evidence, the unresolved point,
   and the smallest next step.
3. They mark whether the evidence supports the preview.
4. They edit or accept one draft, or explicitly approve and verify one Apple
   Reminder. If Person/Pursuit review causes them to stop, they use `Cancel`.
5. After completion or cancellation, they answer the two brief trial questions
   and expand `Privacy-safe session measures`.
6. They copy the measures and save only that JSON as a separate session file.

Do not coach the participant toward `Yes`, prevent normal edits, or turn an
unsupported/no-action result into a proposed action.

## Aggregate without raw content

Run:

```sh
node scripts/macos/summarize-companion-trials.mjs trial-measures/*.json > trial-summary.json
```

The summarizer accepts only schema-v2 content-free fields, rejects unknown
fields, rejects duplicate session IDs, and emits counts plus timing summaries
without reproducing session IDs. Keep the individual files local to the trial
operator and delete them after the agreed evaluation window.

The resulting summary should answer:

- time to first value;
- whether `What changed` made sense;
- whether the exact evidence supported the preview;
- whether the next move was adopted directly or after editing;
- whether a draft or reminder was actually used;
- whether consequence review was started, confirmed, or abandoned;
- whether the recruiter would choose the companion again.

Five to eight completed authorized sessions are still required. A successful
script run or synthetic fixture does not satisfy that requirement.

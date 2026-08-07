# Raw project wiki

`_index/` is the source-of-edit for project knowledge. It keeps raw inputs and
working thought separate from the concise, compiled pages in `docs/`.

## Layers

| Path | Purpose | Published directly? |
| --- | --- | --- |
| `inbox/` | First landing place for human or LLM article drafts | No |
| `notes/` | Personal thinking, questions, and incomplete synthesis | No |
| `sources/` | Source records plus repository-safe screenshots or article extracts | No |
| `pages/` | Reviewed wiki source pages with publishing metadata | Yes, through the compiler |
| `templates/` | Starting structures for pages, notes, and source records | No |
| `log.md` | Append-only record of builds that changed compiled output | No |

Raw means uncompiled, not ungoverned. Do not store real candidate data,
credentials, private conversations, or copyrighted material without permission.
Prefer a source record with a URL, access date, ownership, and a short
repository-safe excerpt over copying an entire article.

## Language

Preserve language at intake and normalize only at publication:

| Layer | Language rule |
| --- | --- |
| `sources/` | Prefer the source's original language; label any translation. |
| `notes/` and `inbox/` | Use the language that best preserves the working thought. |
| `pages/` drafts | May use another declared language while editorial translation is in progress. |
| `pages/` published | Must declare `language: en` and contain reviewed English prose. |
| generated `docs/` | English; the compiler validates and projects but does not translate. |

Keep the source-language record linked when an English page is published. Do
not overwrite original nuance merely to make the raw index uniform.

## Manual workflow

1. Capture a source in `sources/`, a thought in `notes/`, or a draft in
   `inbox/`.
2. Reconcile the draft with an existing page before creating a new concept.
3. Move a reviewed article to `pages/`, complete its front matter, and declare
   its current language.
4. Produce and review the English editorial page, then set
   `language: en` and `status: published`.
5. Run `pnpm wiki:build`.
6. Review the generated `docs/` diff and `_index/log.md`.
7. Run `pnpm wiki:test && pnpm wiki:check` before pushing.

See [[wiki-workflow]] for the full operating method and the canonical
[documentation system](../docs/documentation.md) for knowledge-routing policy.

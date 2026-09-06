# Opik prompt ownership and publication

- Accessed: 2026-09-06
- Owner: Comet / Opik
- Sources: [Prompt Library](https://www.comet.com/docs/opik/development/prompt-library/getting-started),
  [TypeScript prompt APIs](https://www.comet.com/docs/opik/reference/typescript-sdk/prompts)
- Local verification: installed SDK and server report 2.2.45; the server's
  PromptResource and PromptVersion contracts were inspected alongside live API
  readback. No third-party article text is copied here.

The library stores named prompt versions outside application code and supports
retrieving a selected version. The verified local API also resolves a version
by project and environment, and moves an environment binding between versions.
Its UI exposes Edit, Create new version, version history and Deploy to.

The TypeScript documentation's Best Practices section explicitly recommends
storing prompts in code and versioning them alongside code. It demonstrates
mirroring source templates through `createPrompt`. LangSmith also documents
exporting prompts and loading them locally in [offline mode](https://docs.langchain.com/langsmith/manage-prompts-programmatically#offline-mode).
These capabilities do not require the application to fetch a mutable prompt for
every task.

The initial local proof used dynamic environment retrieval and verified live
publication and rollback. The owner subsequently chose bundled loading with
explicit version mirroring. That current decision is owned by
[ADR 0013](../../docs/decisions/0013-bundle-prompts-with-code.md); operational
instructions are in [prompt operations](../../docs/operations/opik-prompts.md).

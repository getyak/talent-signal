# SEO and GEO blog launch

## Outcome

Launch an editorial blog that makes Talent Signal's evidence-first recruiting
method discoverable in traditional search and AI-grounded answers without
turning the website into a keyword-driven content farm.

Completion evidence:

- `/blog`, `/blog/about`, and static article routes render on desktop and
  mobile;
- the home page and global navigation expose a coherent path into the blog;
- every public article has unique metadata, a self-canonical URL, crawlable
  text, authorship, publication and modification dates, sources, and matching
  `BlogPosting` plus breadcrumb structured data;
- sitemap, RSS, robots, and social preview surfaces include the new content;
- focused tests, lint, typecheck, production build, and visual review pass.

## Boundary

In scope:

- a small code-owned content model for the initial editorial proof;
- blog index, article, editorial-policy, RSS, sitemap, metadata, and structured
  data surfaces;
- three substantive seed articles grounded in existing product research;
- homepage, header, and footer discovery paths;
- a durable SEO/GEO strategy and publishing rubric.

Out of scope:

- a CMS, newsletter provider, analytics vendor, Search Console account, or
  external publishing automation;
- invented customer proof, ranking claims, or unreviewed high-volume content;
- locale routes or translated duplicates before a real publishing workflow
  exists;
- IndexNow submission before deployment ownership and a verified production
  key exist.

## Current evidence

- The site already has semantic HTML, responsive navigation, dual-theme
  tokens, baseline metadata, `robots.txt`, `sitemap.xml`, and organization,
  software, and FAQ structured data.
- It has no content collection, article metadata, RSS feed, author or editorial
  policy surface, blog internal links, or article-level social images.
- Google and Bing both state that ordinary discovery, indexing, content
  quality, and trust practices remain the foundation of generative search.
- Google explicitly says that no special AI schema or machine-readable AI file
  is required. OpenAI identifies `OAI-SearchBot` as the crawler relevant to
  ChatGPT search inclusion.

## Approach

Use static, typed content in the existing Next.js application. This keeps the
first slice dependency-free, fast, inspectable, and easy to replace with a CMS
later. Render each article from structured blocks so the page hierarchy,
anchors, answer-first summary, sources, and metadata cannot drift apart.

The content strategy uses three tightly related pillars:

1. candidate momentum as a temporal decision model;
2. evidence and current dependencies as the unit of useful context;
3. human authority over AI proposals and consequential actions.

Rejected for this slice:

- MDX, because three seed articles do not justify another compiler and content
  runtime;
- a tag archive for every phrase, because thin archive pages would add crawl
  surface without user value;
- `llms.txt` as an optimization claim, because Google says additional AI text
  files are not required and the convention has no universal crawler contract;
- FAQ schema on article questions, because visible question sections are useful
  but unsupported rich-result markup would add no dependable value here.

## Milestones

- [x] Audit the existing site, working tree, and SEO surface.
- [x] Verify current SEO and generative-search guidance from primary sources.
- [x] Implement the typed content model and all blog routes.
- [x] Integrate discovery, sitemap, robots, RSS, metadata, and structured data.
- [x] Verify rendering, structured output, tests, and production build.
- [x] Review against `REVIEW.md` and close or record remaining uncertainty.

## Completion review

- `pnpm check` passes with 16 static or server routes, including the blog index,
  three prerendered articles, editorial method, RSS, sitemap, and robots routes.
- Browser review passes at 1280px and 390px with no horizontal overflow, a
  working mobile navigation cycle, coherent light and dark themes, and visible
  text contrast above WCAG AA for sampled body and secondary copy.
- Lighthouse on the production blog route reports 97 performance, 100
  accessibility, 100 best practices, 100 SEO, zero layout shift, and 20ms total
  blocking time. The synthetic mobile LCP is 2.6 seconds after the featured
  image received an explicit high-priority hint, down from 3.0 seconds.
- The residual 0.1 second above the 2.5 second lab target is non-blocking. The
  LCP subparts attributable to the page total about 171ms in the second audit;
  deployment latency and real-user 75th-percentile Core Web Vitals still need
  observation after release.
- Ranking, indexing, citations, and qualified organic conversions cannot be
  proven locally. Search Console, Bing Webmaster Tools, and referral monitoring
  remain deployment-owner work described in the strategy document.

## Decisions that could change the direction

- A real named editor should replace the organization byline when publication
  ownership is assigned.
- A CMS should replace code-owned content when publishing cadence or multiple
  editors make pull-request publishing a bottleneck.
- IndexNow should be added after a deployment owner can protect and verify the
  production key and observe submissions.
- Translation routes should be added only with native editorial review and
  stable `hreflang` ownership.

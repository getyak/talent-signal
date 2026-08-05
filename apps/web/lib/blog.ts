export type BlogSource = {
  title: string;
  publisher: string;
  url: string;
};

export type BlogPoint = {
  title: string;
  body: string;
};

export type BlogSection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  points?: readonly BlogPoint[];
  references?: readonly number[];
};

export type BlogPost = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  heroImage: string;
  heroAlt: string;
  directAnswer: string;
  keyTakeaways: readonly string[];
  sections: readonly BlogSection[];
  sources: readonly BlogSource[];
  relatedSlugs: readonly string[];
};

export const editorialAuthor = {
  name: "Talent Signal Editorial",
  url: "/blog/about",
  description:
    "Product research and practical methods for evidence-first, relationship-led search.",
} as const;

export const blogPosts: readonly BlogPost[] = [
  {
    slug: "candidate-momentum-vs-pipeline-stage",
    title: "Candidate momentum is not a pipeline stage",
    seoTitle: "Candidate Momentum vs. Pipeline Stage: A Practical Model",
    description:
      "Learn how candidate momentum differs from pipeline stage, and use evidence, change, dependency, action, and outcome to guide recruiter attention.",
    excerpt:
      "A pipeline stage says where a process sits. Candidate momentum explains what changed, what is blocked, and what must happen now.",
    category: "Candidate momentum",
    publishedAt: "2026-08-05T09:00:00+08:00",
    updatedAt: "2026-08-05T09:00:00+08:00",
    heroImage: "/images/blog/candidate-momentum.webp",
    heroAlt:
      "Paper evidence fragments connected to a decision point by one vermilion thread.",
    directAnswer:
      "Candidate momentum is the time-sensitive state of a recruiting relationship: what changed, what currently blocks progress, who owns that dependency, and when it must be resolved. A pipeline stage records where a process sits. It does not explain whether the relationship is moving.",
    keyTakeaways: [
      "Treat stage as process location and momentum as relationship state.",
      "Record the current dependency before proposing a follow-up.",
      "Measure whether an action resolved uncertainty, not whether activity increased.",
    ],
    sections: [
      {
        id: "stage-and-momentum",
        title: "A stage is a label. Momentum is a changing state.",
        paragraphs: [
          "A candidate can remain in the same interview stage while the relationship changes materially. A competing offer may appear. A relocation preference may become a hard constraint. A client may still owe an answer about remote work. None of those changes requires the ATS stage to move, yet each can alter what the recruiter should do next.",
          "The reverse is also true. A candidate can move from first interview to final interview while momentum weakens because an unresolved dependency is getting older. Stage progression is useful operational data. It is not a complete account of the relationship.",
          "This distinction matters most in independent and boutique search, where trust and timing often live in messages, calls, and commitments that do not fit cleanly into a pipeline field.",
        ],
      },
      {
        id: "five-part-record",
        title: "The five-part momentum record",
        paragraphs: [
          "A useful momentum record is small enough to review at a glance and complete enough to explain a decision later. It keeps five objects separate.",
        ],
        points: [
          {
            title: "Evidence",
            body: "The exact message, note, or meeting observation, with speaker, source, and time.",
          },
          {
            title: "Verified change",
            body: "What became newly true, changed meaning, or superseded an earlier understanding.",
          },
          {
            title: "Current dependency",
            body: "The one unresolved fact, answer, commitment, or decision that progress depends on now.",
          },
          {
            title: "Approved action",
            body: "The smallest specific step the recruiter chooses after reviewing the evidence and exact effect.",
          },
          {
            title: "Observed outcome",
            body: "Whether the action happened and whether it resolved, changed, or failed to resolve the dependency.",
          },
        ],
      },
      {
        id: "practical-example",
        title: "An illustrative example",
        paragraphs: [
          "A candidate says that another company needs an answer on Wednesday and that remote flexibility matters. A summary might preserve both statements. A pipeline might still say final interview. A momentum record asks a more useful sequence of questions.",
          "First, which words are explicit evidence? Second, is remote work a preference or a condition? Third, does the recruiter know the client's policy, or is that the current dependency? Fourth, what is the smallest action that can resolve it before the candidate's decision window closes? Finally, did that action produce a verified answer in time?",
          "The value does not come from assigning urgency to the candidate. It comes from making the time-bound dependency visible to the recruiter who can act on it.",
        ],
      },
      {
        id: "not-a-score",
        title: "Momentum should never become a person score",
        paragraphs: [
          "A single momentum number is tempting because it is easy to sort. It is also dangerous. It compresses evidence quality, time pressure, recruiter responsibility, client delay, and model interpretation into one unexplained value. The number can quickly look like a judgment of the person rather than a prompt about the work.",
          "Rank work attention instead. A clear deadline, an unmet commitment, or a stale client dependency can justify attention. Candidate worth, personality, protected traits, culture fit, and predicted acceptance should not.",
          "When evidence is incomplete, the correct state may be insufficient evidence or no action. Calm inaction is better than a confident recommendation built on a missing source.",
        ],
        references: [1, 2],
      },
      {
        id: "start-small",
        title: "Start without replacing the ATS",
        paragraphs: [
          "Keep the ATS as the process record. Add a narrow relationship layer that watches only recruiter-selected evidence, proposes atomic changes, and asks for confirmation before anything consequential happens.",
          "Begin with one candidate and one assignment. Preserve the source, confirm identity, separate facts from interpretation, name the current dependency, and propose one reversible action. When the action is complete, record the outcome and let that outcome update the current view.",
          "This is enough to test the real promise: less reconstruction and better-timed follow-through. A larger feature set cannot compensate if this loop is not trustworthy.",
        ],
        references: [3, 4],
      },
    ],
    sources: [
      {
        title: "Human-AI interaction and risk management",
        publisher: "NIST AI Resource Center",
        url: "https://airc.nist.gov/airmf-resources/airmf/appendices/app-c-ai-risk-management-and-human-ai-interaction/",
      },
      {
        title: "Human oversight under Article 14",
        publisher: "European Union",
        url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32024R1689",
      },
      {
        title: "AI Notetaker",
        publisher: "Ashby",
        url: "https://docs.ashbyhq.com/ai-notetaker",
      },
      {
        title: "Overview for talent acquisition",
        publisher: "Metaview",
        url: "https://support.metaview.ai/guides/overview-for-ta",
      },
    ],
    relatedSlugs: [
      "what-ats-notes-lose",
      "recruiting-ai-without-decision-authority",
    ],
  },
  {
    slug: "recruiting-ai-without-decision-authority",
    title: "Use recruiting AI without giving it decision authority",
    seoTitle: "Human Oversight for Recruiting AI: A Practical Design",
    description:
      "A practical model for using AI in recruiting while keeping evidence, interpretation, approval, execution, and outcomes under human control.",
    excerpt:
      "AI can reduce reconstruction work without deciding what is true, who deserves attention, or what changes outside the workspace.",
    category: "Responsible recruiting AI",
    publishedAt: "2026-08-05T09:15:00+08:00",
    updatedAt: "2026-08-05T09:15:00+08:00",
    heroImage: "/images/blog/human-judgment.webp",
    heroAlt:
      "A hand uses a vermilion pencil to confirm one proposed mark on layered paper and glass.",
    directAnswer:
      "Use recruiting AI as a proposal system, not a decision authority. It may extract candidate facts, identify possible changes, and draft a reversible next action. The recruiter should verify the source, correct the interpretation, approve the exact external effect, and observe the result.",
    keyTakeaways: [
      "Keep the model's proposal distinct from recruiter-confirmed state.",
      "Approval must show the exact destination, change, and recovery path.",
      "Track corrections, dismissals, failures, and no-action decisions as useful outcomes.",
    ],
    sections: [
      {
        id: "right-job-for-ai",
        title: "Give AI reconstruction work, not relationship authority",
        paragraphs: [
          "Recruiters lose time rebuilding context across messages, notes, calendars, and ATS records. AI is well suited to the first pass: locate explicit statements, group related evidence, identify possible changes, and draft a concise next step.",
          "That capability does not make the model the owner of truth. Candidate identity may be ambiguous. A preference may be mistaken for a constraint. A relative date may be resolved in the wrong timezone. A plausible follow-up may ignore an earlier commitment.",
          "The safe boundary is simple: the model proposes, the domain validates, and the recruiter decides. A polished summary or confident tone cannot cross that boundary.",
        ],
        references: [1, 2],
      },
      {
        id: "four-boundaries",
        title: "Protect four boundaries",
        paragraphs: [
          "Human oversight becomes practical when the system separates the moments where authority changes hands.",
        ],
        points: [
          {
            title: "Evidence boundary",
            body: "The source must support the proposed fact word for word, with speaker and time visible when they matter.",
          },
          {
            title: "State boundary",
            body: "A proposal does not become confirmed candidate state until the recruiter accepts or edits it.",
          },
          {
            title: "Action boundary",
            body: "A draft message, calendar event, or record patch has no execution authority until the exact effect is approved.",
          },
          {
            title: "Outcome boundary",
            body: "A successful API response is not the same as a resolved relationship dependency. The result must be observed.",
          },
        ],
      },
      {
        id: "approval-can-fail",
        title: "A confirm button is not enough",
        paragraphs: [
          "A review screen can technically include a human and still encourage automation bias. If every proposal looks complete, evidence is hidden, defaults are preselected, and the easiest action is accept all, the interface transfers responsibility without supporting judgment.",
          "NIST recommends defining human roles and responsibilities across the AI lifecycle and monitoring how people use or override system output. The EU AI Act's human-oversight requirements also call out the need to understand limitations, avoid over-reliance, and be able to disregard, reverse, or stop output in relevant high-risk contexts.",
          "Talent Signal is not making a legal classification claim here. The design lesson is broader: oversight must be operational, not ceremonial.",
        ],
        references: [1, 2],
      },
      {
        id: "review-interface",
        title: "Design a review that supports judgment",
        paragraphs: [
          "Show one atomic change at a time. Put exact evidence beside it. When a value changes, show before and after. Label proposed, edited, confirmed, dismissed, failed, and superseded states in words, not only color.",
          "Ask for stronger confirmation as consequence increases. Correcting a low-risk note can stay lightweight. Matching an uncertain identity, changing a deadline, sending a message, or writing to a calendar deserves more explicit review.",
          "Always keep edit, dismiss, retry, and recovery paths available. A good system treats not enough evidence as a valid result and lets a recommendation correctly become no action.",
        ],
        references: [3],
      },
      {
        id: "measure-oversight",
        title: "Measure whether oversight works",
        paragraphs: [
          "Acceptance rate alone rewards agreement, not quality. Review the rate and reasons for edits, dismissals, identity corrections, expired proposals, execution failures, and actions that did not resolve the dependency.",
          "Look for rubber-stamping patterns as well as model errors. Fast repeated confirmation may mean the proposals are excellent, or it may mean the evidence is too hard to inspect. Pair behavior with qualitative review before changing the gate.",
          "Measure time saved separately from decision quality. Faster review is valuable only when the recruiter can still identify the source, understand uncertainty, and recover from a wrong proposal. If speed improves while corrections or unresolved outcomes rise, the workflow has moved work out of sight rather than removing it.",
          "The durable learning is the gap between proposal, decision, and observed outcome. That gap teaches the product where recruiter judgment adds value without turning the recruiter into a labeler for an autonomous system.",
        ],
        references: [1],
      },
    ],
    sources: [
      {
        title: "AI RMF appendix on human-AI interaction",
        publisher: "NIST AI Resource Center",
        url: "https://airc.nist.gov/airmf-resources/airmf/appendices/app-c-ai-risk-management-and-human-ai-interaction/",
      },
      {
        title: "Regulation (EU) 2024/1689, Article 14",
        publisher: "European Union",
        url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32024R1689",
      },
      {
        title: "Post-interview AI notes and manual insertion",
        publisher: "Ashby",
        url: "https://docs.ashbyhq.com/ai-notetaker-post-interview",
      },
    ],
    relatedSlugs: [
      "candidate-momentum-vs-pipeline-stage",
      "what-ats-notes-lose",
    ],
  },
  {
    slug: "what-ats-notes-lose",
    title: "What ATS notes lose between candidate conversations",
    seoTitle: "What ATS Notes Lose Between Candidate Conversations",
    description:
      "See why static ATS notes miss evidence, change, time, current dependencies, and outcomes, and how a living candidate brief preserves them.",
    excerpt:
      "A note can preserve what was said while losing what changed, what remains unresolved, and why the next action matters now.",
    category: "Recruiter workflow",
    publishedAt: "2026-08-05T09:30:00+08:00",
    updatedAt: "2026-08-05T09:30:00+08:00",
    heroImage: "/images/blog/current-dependency.webp",
    heroAlt:
      "Four glass tiles preserve different states while one vermilion marker identifies the current dependency.",
    directAnswer:
      "Static ATS notes usually preserve a latest narrative, but decision-ready recruiting context also needs the exact source, what changed, when it became true, the current unresolved dependency, who owns the next action, and whether the action worked.",
    keyTakeaways: [
      "Preserve the evidence path, not only the latest prose summary.",
      "Represent changing facts as history instead of overwriting them.",
      "Let the current dependency organize the brief and its next action.",
    ],
    sections: [
      {
        id: "note-is-not-state",
        title: "A note is not a relationship state",
        paragraphs: [
          "A recruiter may write an accurate note after a conversation and still struggle before the next one. The note explains what happened at one moment. It rarely explains which earlier fact changed, whether the new statement was confirmed, what now blocks progress, or whether a promised action happened.",
          "Adding more prose does not solve the problem. Longer summaries can make the current dependency harder to see and make contradictions easier to miss. The useful object is a living, assignment-scoped view built from inspectable evidence and versioned decisions.",
          "This view should stay small. It is not a permanent AI-authored profile and it does not replace the ATS. It explains what is currently true for this search and how that understanding changed.",
        ],
      },
      {
        id: "five-losses",
        title: "Five things disappear in a flat note",
        paragraphs: [
          "The same sentence can mean different things depending on its source, timing, and relationship to earlier evidence. Five losses are especially costly.",
        ],
        points: [
          {
            title: "Provenance",
            body: "The reader cannot reach the exact message, speaker, screenshot region, or meeting observation behind the claim.",
          },
          {
            title: "Change",
            body: "The latest value appears without the earlier value or the reason the understanding changed.",
          },
          {
            title: "Time",
            body: "A deadline, preference, or availability remains visible after it has expired or been superseded.",
          },
          {
            title: "Dependency",
            body: "The note lists several facts but does not name the one unresolved answer that progress depends on now.",
          },
          {
            title: "Outcome",
            body: "The record shows a proposed follow-up but not whether it happened or resolved the issue.",
          },
        ],
      },
      {
        id: "history-without-clutter",
        title: "Keep history without making the page heavy",
        paragraphs: [
          "The current view should lead with identity, assignment context, the meaningful change, the current dependency, supporting evidence, and one next step. Earlier values and dismissed proposals can sit behind progressive disclosure.",
          "When a fact changes, append the new version and mark the earlier one as superseded. Do not silently overwrite it. Preserve when the fact was true in the relationship and when the system learned or changed it. Those two times are not always the same.",
          "This history makes correction safer. It also lets the recruiter understand why an earlier recommendation was reasonable without pretending that the old recommendation is still current.",
        ],
        references: [1],
      },
      {
        id: "current-dependency",
        title: "Let the current dependency organize the brief",
        paragraphs: [
          "A candidate brief should not compete with itself. If remote policy is the answer needed before another interview can be useful, that dependency deserves more attention than a broad summary of the candidate's background.",
          "The next action should be the smallest step that can reduce that uncertainty. It may be a recruiter question, a client confirmation, a reminder, or no action until more evidence exists. It should not be a generic check-in generated because a clock elapsed.",
          "Once the dependency changes, the brief should change with it. The old action moves into history with its observed result, while the current view becomes calm again.",
        ],
      },
      {
        id: "minimum-living-brief",
        title: "The minimum useful living brief",
        paragraphs: [
          "Start with a small contract: confirmed identity and assignment, one current dependency, a handful of source-linked facts, recent meaningful changes, one reviewable action, and the outcome of the previous action.",
          "Support ambiguity openly. An unmatched screenshot can remain unbound. A date can stay unresolved. A proposed fact can be dismissed. A deleted source should remove or invalidate its derivatives according to the user's retention choice.",
          "The test is practical: can the recruiter understand what changed and why the next step matters without rereading the entire conversation? If not, another summary is unlikely to help.",
        ],
        references: [2, 3, 4],
      },
    ],
    sources: [
      {
        title: "Graphiti temporal knowledge graph",
        publisher: "Zep",
        url: "https://github.com/getzep/graphiti",
      },
      {
        title: "Selecting photos and videos in iOS",
        publisher: "Apple Developer Documentation",
        url: "https://developer.apple.com/documentation/PhotoKit/selecting-photos-and-videos-in-ios",
      },
      {
        title: "Recognizing text in images",
        publisher: "Apple Developer Documentation",
        url: "https://developer.apple.com/documentation/vision/recognizing-text-in-images",
      },
      {
        title: "Talent Signal privacy principles",
        publisher: "Talent Signal",
        url: "/privacy",
      },
    ],
    relatedSlugs: [
      "candidate-momentum-vs-pipeline-stage",
      "recruiting-ai-without-decision-authority",
    ],
  },
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}

export function formatBlogDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date(value));
}

export function getBlogPostText(post: BlogPost) {
  return [
    post.title,
    post.description,
    post.directAnswer,
    ...post.keyTakeaways,
    ...post.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...(section.points?.flatMap((point) => [point.title, point.body]) ?? []),
    ]),
  ].join(" ");
}

export function getBlogPostWordCount(post: BlogPost) {
  return getBlogPostText(post).trim().split(/\s+/).length;
}

export function getBlogPostReadingMinutes(post: BlogPost) {
  return Math.max(1, Math.ceil(getBlogPostWordCount(post) / 200));
}

export function getLatestBlogUpdate() {
  return blogPosts.reduce(
    (latest, post) =>
      new Date(post.updatedAt).getTime() > new Date(latest).getTime()
        ? post.updatedAt
        : latest,
    blogPosts[0].updatedAt,
  );
}

export function getBlogPostsByNewest() {
  return [...blogPosts].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() -
      new Date(left.publishedAt).getTime(),
  );
}

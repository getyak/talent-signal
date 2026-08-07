export const siteConfig = {
  name: "Talent Signal",
  title: "Talent Signal | Relationship intelligence for executive search",
  description:
    "Turn one recruiter-controlled conversation into verified context and the smallest safe next move.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://gettalentsignal.com",
  email: "hello@talentsignal.ai",
} as const;

export const accessRequestHref =
  `mailto:${siteConfig.email}?subject=Talent%20Signal%20access%20request`;

export const navigation = [
  {
    href: "/#product",
    label: "Product",
    description: "See evidence change the record",
  },
  {
    href: "/demo",
    label: "Live demo",
    description: "Review one synthetic conversation",
  },
  {
    href: "/#method",
    label: "Method",
    description: "Follow the governed state history",
  },
  {
    href: "/blog",
    label: "Research",
    description: "Read the evidence-led product method",
  },
  {
    href: "/#principles",
    label: "Trust",
    description: "Inspect the human decision boundary",
  },
] as const;

export const faqs = [
  {
    question: "Is Talent Signal an ATS?",
    answer:
      "No. It is a focused candidate-momentum layer for the conversations and commitments that traditional systems flatten into notes.",
  },
  {
    question: "Does it send messages or edit records automatically?",
    answer:
      "No. Every proposed contact or calendar change stays reviewable. You can confirm, edit, or dismiss it before anything changes.",
  },
  {
    question: "What happens to imported evidence?",
    answer:
      "The product is designed around intentional import, source-linked facts, and deletion of both original evidence and its derivatives.",
  },
  {
    question: "Who is the product for?",
    answer:
      "Independent recruiters and boutique search teams running high-value, relationship-led searches where timing and trust decide outcomes.",
  },
  {
    question: "Does Talent Signal score or rank candidates?",
    answer:
      "No. It can rank recruiter attention around current dependencies, but it does not turn a person into a fit, quality, personality, potential, or acceptance score.",
  },
] as const;

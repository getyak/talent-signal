export const siteConfig = {
  name: "Talent Signal",
  title: "Talent Signal | Every relationship has a redline",
  description:
    "Turn one recruiter-controlled conversation into a source-linked relationship change and one separately approved next action.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://gettalentsignal.com",
  email: "hello@talentsignal.ai",
} as const;

export const navigation = [
  { href: "/#product", label: "Product" },
  { href: "/#method", label: "Method" },
  { href: "/blog", label: "Blog" },
  { href: "/#principles", label: "Principles" },
  { href: "/#questions", label: "Questions" },
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
] as const;

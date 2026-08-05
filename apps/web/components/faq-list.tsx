import { faqs } from "@/lib/site";

export function FaqList() {
  return (
    <div className="faq-list">
      {faqs.map((faq, index) => (
        <details key={faq.question} open={index === 0}>
          <summary>{faq.question}</summary>
          <p>{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}

import { faqs } from "@/lib/site";

export function FaqList() {
  const faqColumns = [
    { id: "product", items: faqs.slice(0, 2) },
    { id: "evidence", items: faqs.slice(2) },
  ];

  return (
    <div className="faq-list">
      {faqColumns.map((column, columnIndex) => (
        <div className="faq-list__column" key={column.id}>
          {column.items.map((faq, index) => (
            <details
              key={faq.question}
              open={columnIndex === 0 && index === 0}
            >
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}

import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./conversation-response.module.css";

/** Presentation only: model text cannot load images or acquire citation authority.
 * React Markdown escapes raw HTML by default; do not add a raw-HTML plugin.
 * https://github.com/remarkjs/react-markdown#security
 * Governed source links continue to belong to their explicit evidence controls.
 */
export const ConversationResponse = memo(function ConversationResponse({
  children,
}: {
  children: string;
}) {
  return (
    <div className={styles.response}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h3>{children}</h3>,
          a: ({ children, href }) => (
            <span>{children}{href && children !== href ? <span className={styles.destination}> ({href})</span> : null}</span>
          ),
          img: ({ alt }) => <span className={styles.destination}>[图片{alt ? `：${alt}` : ""}]</span>,
          table: ({ children }) => (
            <div aria-label="表格（可横向滚动）" className={styles.tableScroll} role="region" tabIndex={0}>
              <table>{children}</table>
            </div>
          ),
          pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
});

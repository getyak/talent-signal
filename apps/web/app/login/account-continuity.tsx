import { Browser, Desktop, DeviceMobile } from "@phosphor-icons/react/dist/ssr";
import styles from "./login.module.css";

/** A product promise, never a preview of another account's private content. */
export function AccountContinuity() {
  return (
    <aside className={styles.continuity} aria-label="跨设备继续你的工作">
      <p className={styles.eyebrow}>让重要的连接，延续下去</p>
      <h2>换个屏幕，<br />继续上次的对话。</h2>
      <p className={styles.story}>联系人、会话和一路积累的上下文，<br />始终在你的同一账号里。</p>
      <div className={styles.continuityMap}>
        <p className={styles.accountLine}><span aria-hidden="true" />你的关系工作台</p>
        <ul className={styles.devices} aria-label="可使用的设备">
          <li><DeviceMobile size={21} aria-hidden="true" />iPhone</li>
          <li><Browser size={21} aria-hidden="true" />Web</li>
          <li><Desktop size={21} aria-hidden="true" />Mac</li>
        </ul>
      </div>
    </aside>
  );
}

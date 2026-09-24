'use client';

import { useActionState, useState } from 'react';
import type { AccountSettings, ReconciliationRecord } from '@talent-signal/contracts';
import {
  cancelConflictRecovery,
  confirmConflictRecovery,
  prepareConflictRecovery,
  startConflictProviderVerification,
  type ConflictRecoveryState,
} from '@/app/workspace/settings/conflict/actions';
import { startDuplicateProof } from '@/app/workspace/settings/login-methods/actions';
import styles from './account-sign-in-methods.module.css';

/**
 * Authenticated historical-conflict recovery (ADR 0018).
 *
 * The screen explains the canonical choice before anything happens: the
 * current account keeps its data, and the other account's login is transferred
 * only if that account is entirely empty. Both identities are freshly proven
 * before the readback shows data categories and counts; non-empty duplicates
 * end in a protected review-required state. Nothing is merged or re-parented
 * here, and no raw records ever appear.
 */

type InventoryShape = {
  account_tables?: Array<{ table: string; rows: number; classification: string }>;
  problems?: string[];
  entirely_empty?: boolean;
};

export function inventorySummary(record: ReconciliationRecord) {
  const inventory = (record.inventory ?? {}) as InventoryShape;
  const tables = inventory.account_tables ?? [];
  const productRows = tables
    .filter((entry) => entry.classification === 'product')
    .reduce((total, entry) => total + entry.rows, 0);
  const identityRows = tables
    .filter((entry) => entry.classification === 'identity')
    .reduce((total, entry) => total + entry.rows, 0);
  return {
    productRows,
    identityRows,
    problems: inventory.problems ?? [],
    entirelyEmpty: record.kind === 'empty_duplicate_transfer',
  };
}

export function AccountConflictRecovery({ initial, recovery }: {
  initial: AccountSettings;
  recovery?: {
    operationRef: string | null;
    roles: {
      current: { provider: string; expiresAt: string } | null;
      duplicate: { provider: string; expiresAt: string } | null;
    };
  };
}) {
  const [state, action, pending] = useActionState<ConflictRecoveryState, FormData>(
    prepareConflictRecovery,
    {},
  );
  const [confirmState, confirmAction, confirming] = useActionState<ConflictRecoveryState, FormData>(
    confirmConflictRecovery,
    {},
  );
  const [cancelState, cancelAction, cancelling] = useActionState<ConflictRecoveryState, FormData>(
    cancelConflictRecovery,
    {},
  );
  const [stage, setStage] = useState<'intro' | 'proof' | 'preview' | 'done'>('intro');
  // A settle result only applies to the attempt it acted on; a newer prepare
  // (cancel then retry) replaces the old cancelled record instead of sticking.
  const record = (() => {
    const settled = confirmState.record ?? cancelState.record;
    if (state.record && (!settled || settled.id !== state.record.id)) return state.record;
    return settled ?? state.record;
  })();
  const scopeFields = (
    <>
      <input type="hidden" name="accountId" value={initial.workspace.id} />
      <input type="hidden" name="userId" value={initial.user.id} />
      <input type="hidden" name="accountRevision" value={String(initial.workspace.revision)} />
      <input type="hidden" name="userRevision" value={initial.user.revision} />
      {recovery?.operationRef ? (
        <input type="hidden" name="operationRef" value={recovery.operationRef} />
      ) : null}
    </>
  );
  const stagedCurrent = recovery?.roles.current ?? null;
  const stagedDuplicate = recovery?.roles.duplicate ?? null;

  if (initial.email_ownership_state !== 'conflict') return null;

  const summary = record ? inventorySummary(record) : null;

  return (
    <section className={styles.section} aria-labelledby="conflict-recovery-title">
      <h2 id="conflict-recovery-title">这个邮箱关联了两个历史账户</h2>
      <p className={styles.secondary}>
        历史原因让同一个邮箱出现在两个账户上。它们的数据各自独立，不会自动合并。你现在登录的这个账户
        （{initial.user.email}）保持不变；另一个账户的登录方式只有在它完全为空时才会转移过来，并留下审计记录。
      </p>
      {stage === 'intro' && (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setStage('proof')}>开始核对</button>
        </div>
      )}
      {stage === 'proof' && (
        <form className={styles.stepUp} action={action}>
          {scopeFields}
          <p className={styles.stepUpTitle}>验证两个账户的身份</p>
          <p className={styles.secondary}>
            先验证当前身份（当前密码，或用已绑定的登录方式验证），再提供另一个账户的凭据。两边都验证后才会显示数据清单。
          </p>
          {stagedCurrent && (
            <p className={styles.secondary} role="status">
              {`当前身份已通过 ${stagedCurrent === null ? '' : stagedCurrent.provider} 验证（到 ${stagedCurrent.expiresAt} 有效）。`}
            </p>
          )}
          {!stagedCurrent && (
            <label className={styles.field}>
              <span>当前密码（也可以用已绑定的登录方式验证）</span>
              <input name="currentPassword" type="password" autoComplete="current-password" minLength={1} maxLength={128} />
            </label>
          )}
          {stagedDuplicate && (
            <p className={styles.secondary} role="status">
              {`另一个账户已通过 ${stagedDuplicate.provider} 验证（到 ${stagedDuplicate.expiresAt} 有效）。`}
            </p>
          )}
          {!stagedDuplicate && (
            <>
              <label className={styles.field}>
                <span>另一个账户的用户名或邮箱（用密码验证时填写）</span>
                <input name="duplicateIdentifier" type="text" maxLength={320} />
              </label>
              <label className={styles.field}>
                <span>另一个账户的密码（用密码验证时填写）</span>
                <input name="duplicatePassword" type="password" minLength={1} maxLength={128} />
              </label>
            </>
          )}
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={pending} aria-busy={pending}>
              {pending ? '正在核对…' : '验证并查看清单'}
            </button>
            <button type="button" className={styles.quiet} onClick={() => setStage('intro')} disabled={pending}>取消</button>
          </div>
          <p aria-live="polite" className={state.error ? styles.error : styles.notice}>{state.error ?? ''}</p>
        </form>
      )}
      {stage === 'proof' && (
        <>
          <p className={styles.secondary} role="status">
            验证可以分两步完成：当前账户一次，另一个账户一次。每次验证只记录自己那一步。
          </p>
          {initial.sign_in_methods.some((method) => method.state === 'connected' && method.provider !== 'password') && (
            <form action={startConflictProviderVerification}>
              {scopeFields}
              <input
                type="hidden"
                name="reauthProvider"
                value={(initial.sign_in_methods.find((method) => method.state === 'connected' && method.provider !== 'password')?.provider ?? 'google') as string}
              />
              <div className={styles.actions}>
                <button type="submit" className={styles.quiet}>用已绑定的登录方式验证当前身份</button>
              </div>
            </form>
          )}
          <form action={startDuplicateProof}>
            {scopeFields}
            <label className={styles.field}>
              <span>另一个账户的登录方式</span>
              <select name="duplicateProvider" defaultValue="google">
                <option value="google">Google</option>
                <option value="apple">Apple</option>
              </select>
            </label>
            <div className={styles.actions}>
              <button type="submit" className={styles.quiet}>用另一个账户的登录方式验证它</button>
            </div>
          </form>
        </>
      )}
      {stage !== 'done' && record && summary && !confirmState.committed && (
        <div className={styles.stepUp}>
          <p className={styles.stepUpTitle}>
            {summary.entirelyEmpty ? '另一个账户是完全空的' : '另一个账户保留着数据'}
          </p>
          <p className={styles.secondary}>
            数据清单（仅在双重验证后显示）：产品数据 {summary.productRows} 条；登录与审计记录 {summary.identityRows} 条。
            不会展示任何原始记录内容。
          </p>
          {summary.entirelyEmpty ? (
            <>
              <p className={styles.secondary}>
                确认后：另一个账户的登录方式转移到当前账户，它的旧会话会被退出，并留下审计记录；之后旧账户不能再写入任何数据。
              </p>
              <form action={confirmAction}>
                {scopeFields}
                <input type="hidden" name="reconciliationId" value={record.id} />
                <div className={styles.actions}>
                  <button type="submit" className={styles.primary} disabled={confirming} aria-busy={confirming}>
                    {confirming ? '正在确认…' : '确认转移'}
                  </button>
                </div>
                <p aria-live="polite" className={confirmState.error ? styles.error : styles.notice}>
                  {confirmState.error ?? ''}
                </p>
              </form>
            </>
          ) : (
            <p className={styles.error}>
              这个账户不是空的：需要单独的核对流程，由人逐项审阅。系统不会自动合并或转移任何数据；两个账户的数据都继续通过各自的登录方式访问。
            </p>
          )}
          <form action={cancelAction}>
            {scopeFields}
            <input type="hidden" name="reconciliationId" value={record.id} />
            <div className={styles.actions}>
              <button type="submit" className={styles.quiet} disabled={cancelling}>取消这次核对</button>
            </div>
            <p aria-live="polite" className={cancelState.error ? styles.error : styles.notice}>
              {cancelState.error ?? (cancelState.record?.state === 'cancelled' ? '已取消，没有做任何更改。' : '')}
            </p>
          </form>
        </div>
      )}
      {confirmState.committed && (
        <div className={styles.stepUp}>
          <p className={styles.stepUpTitle}>已完成核对</p>
          <p className={styles.secondary}>
            另一个账户的登录方式已经转移到当前账户，旧会话已退出，并留下了审计记录。刷新后可以看到最新状态。
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setStage('done')}>知道了</button>
          </div>
        </div>
      )}
      {record && record.state === 'cancelled' && !confirmState.committed && stage !== 'done' && (
        <p className={styles.secondary}>这次核对已取消，没有做任何更改。</p>
      )}
    </section>
  );
}

"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import styles from "./login.module.css";

/** A single native field preserves password-manager, paste and keyboard behavior. */
export function PasswordField({ autoComplete, describedBy, disabled, id, invalid, label,
  maxLength, minLength, name, onChange, placeholder, required, value }: {
  autoComplete: string; describedBy?: string; disabled?: boolean; id: string; invalid?: boolean; label: string;
  maxLength?: number; minLength?: number; name: string; onChange: (value: string) => void;
  placeholder?: string; required?: boolean; value: string;
}) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // Mask the field again on submit and when the page loses visibility.
  useEffect(() => {
    const hide = () => setVisible(false);
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className={styles.passwordWrap}>
      <input id={id} name={name} type={visible && !disabled ? "text" : "password"} value={value}
        onChange={event => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder}
        minLength={minLength} maxLength={maxLength} required={required} disabled={disabled}
        autoCapitalize="none" spellCheck={false} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        onKeyUp={event => setCapsLock(event.getModifierState("CapsLock"))} onBlur={() => setCapsLock(false)} />
      <button type="button" className={styles.passwordToggle} onClick={() => setVisible(current => !current)}
        aria-controls={id} aria-label={`${visible ? "隐藏" : "显示"}${label}`} aria-pressed={visible} disabled={disabled}>
        {visible ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
    {capsLock && <span className={styles.capsLock} role="status">大写锁定已开启</span>}
  </div>;
}

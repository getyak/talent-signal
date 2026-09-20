"use client";

import { useState } from "react";

import styles from "./login.module.css";

/**
 * A password input that keeps its value under client ownership so a failed
 * server action cannot discard what was typed, and offers an accessible
 * show/hide control. The value never leaves the browser except in the form
 * submission.
 */
export function PasswordField({
  autoComplete,
  describedBy,
  disabled,
  id,
  invalid,
  label,
  maxLength,
  minLength,
  name,
  onChange,
  placeholder,
  required,
  value,
}: {
  autoComplete: string;
  describedBy?: string;
  disabled?: boolean;
  id: string;
  invalid?: boolean;
  label: string;
  maxLength?: number;
  minLength?: number;
  name: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <div className={styles.fieldHeader}>
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className={styles.passwordToggle}
          onClick={() => setVisible((current) => !current)}
          aria-controls={id}
          aria-label={`${visible ? "隐藏" : "显示"}${label}`}
          disabled={disabled}
        >
          {visible ? "隐藏" : "显示"}
        </button>
      </div>
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
    </div>
  );
}

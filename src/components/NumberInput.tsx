"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { inputCls } from "./ui";

/**
 * Number field that can be cleared while typing (a controlled number input that snaps
 * back to 0 or 1 on every keystroke makes "83.5" come out as "183.5").
 */
export function NumberInput({
  value,
  onValue,
  className = "",
  ...props
}: { value: number; onValue: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  useEffect(() => {
    // follow outside changes (e.g. TDS shortcut, fetched FX rate) without fighting the user's typing
    setText((t) => (Number(t) === value && t !== "" ? t : Number.isFinite(value) ? String(value) : ""));
  }, [value]);
  return (
    <input
      {...props}
      type="number"
      inputMode="decimal"
      step={props.step ?? "any"}
      className={`${inputCls} ${className}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.valueAsNumber;
        onValue(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

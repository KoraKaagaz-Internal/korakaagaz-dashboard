import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid";

const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";
const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm" };
const variants: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white hover:bg-navy/90",
  secondary: "border border-line bg-white text-ink hover:bg-subtle",
  ghost: "text-neutral-600 hover:bg-subtle hover:text-ink",
  danger: "text-danger hover:bg-danger/5",
  dangerSolid: "bg-danger text-white hover:bg-danger/90",
};

export const button = (variant: ButtonVariant = "secondary", size: "sm" | "md" = "md") => `${base} ${sizes[size]} ${variants[variant]}`;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type="button" {...props} className={`${button(variant, size)} ${className}`} />;
}

export function ButtonLink({ variant = "secondary", size = "md", className = "", ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <Link {...props} className={`${button(variant, size)} ${className}`} />;
}

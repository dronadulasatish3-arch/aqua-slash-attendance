import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  type LucideIcon,
} from "lucide-react";

type BtnVariant = "primary" | "green" | "danger" | "cam" | "ghost" | "white";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  icon?: LucideIcon;
  loading?: boolean;
}

export function BigButton({
  variant = "primary",
  icon: Icon,
  loading,
  children,
  disabled,
  ...rest
}: BtnProps) {
  return (
    <button className={`btn btn-${variant}`} disabled={disabled || loading} {...rest}>
      {loading ? (
        <Loader2 size={19} className="animate-spin" />
      ) : (
        Icon && <Icon size={19} strokeWidth={2.4} />
      )}
      <span>{children}</span>
    </button>
  );
}

export type NoticeKind = "ok" | "warn" | "err" | "info";

const noticeIcons: Record<NoticeKind, LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  err: AlertCircle,
  info: Info,
};

export function Notice({ kind, children }: { kind: NoticeKind; children: ReactNode }) {
  const Icon = noticeIcons[kind];
  return (
    <div className={`notice notice-${kind}`}>
      <Icon size={17} strokeWidth={2.4} />
      <div>{children}</div>
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: LucideIcon;
  invalid?: boolean;
}

export function Field({ label, icon: Icon, invalid, ...rest }: FieldProps) {
  return (
    <div>
      <label className="field-label">
        {Icon && <Icon size={13} strokeWidth={2.5} />}
        {label}
      </label>
      <input className={`field-input ${invalid ? "invalid" : ""}`} autoComplete="off" {...rest} />
    </div>
  );
}

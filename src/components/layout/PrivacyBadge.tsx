import { ShieldCheck } from "lucide-react";

export function PrivacyBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`privacy-badge ${className}`.trim()}>
      <ShieldCheck size={15} aria-hidden="true" />
      Processamento local
    </span>
  );
}

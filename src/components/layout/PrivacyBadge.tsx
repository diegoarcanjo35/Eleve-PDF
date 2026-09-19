import { ShieldCheck } from "lucide-react";
import { privacyBadgeLabel } from "./privacyBadgeLabel";

export function PrivacyBadge({ className = "", pathname }: { className?: string; pathname: string }) {
  return (
    <span className={`privacy-badge ${className}`.trim()}>
      <ShieldCheck size={15} aria-hidden="true" />
      {privacyBadgeLabel(pathname)}
    </span>
  );
}

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageCircle, ChevronDown } from "lucide-react";
import { waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

type Parent = "father" | "mother";
type MessageInput = string | ((parent: Parent) => string);

interface WhatsAppActionButtonProps {
  fatherPhone?: string;
  motherPhone?: string;
  /** Either a static message, or a builder that receives the selected parent. */
  message: MessageInput;
  label?: string;
  icon?: React.ElementType;
  disabled?: boolean;
  disabledHint?: string;
  variant?: "card" | "modal";
}

const resolveMessage = (m: MessageInput, parent: Parent) => (typeof m === "function" ? m(parent) : m);

export const WhatsAppActionButton = ({
  fatherPhone,
  motherPhone,
  message,
  label,
  icon: Icon,
  disabled,
  disabledHint,
  variant = "modal",
}: WhatsAppActionButtonProps) => {
  const hasFather = !!fatherPhone && fatherPhone.trim().length > 0;
  const hasMother = !!motherPhone && motherPhone.trim().length > 0;
  const count = (hasFather ? 1 : 0) + (hasMother ? 1 : 0);

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const baseClasses = cn(
    "flex items-center justify-center gap-2 rounded-xl font-semibold transition-opacity shadow-soft",
    variant === "modal" ? "p-3 text-sm" : "p-2 text-xs",
  );

  const activeSize = variant === "card" ? 14 : 18;
  const iconSize = variant === "card" ? 12 : 14;

  if (disabled || count === 0) {
    return (
      <div
        onClick={stopProp}
        className={cn(baseClasses, "bg-muted text-muted-foreground cursor-not-allowed")}
        title={count === 0 ? "אין מספר טלפון" : disabledHint}
        aria-disabled
      >
        <MessageCircle size={activeSize} />
        {label && <span>{label}</span>}
        {Icon && <Icon size={iconSize} className="opacity-70" />}
      </div>
    );
  }

  if (count === 1) {
    const parent: Parent = hasFather ? "father" : "mother";
    const phone = hasFather ? fatherPhone : motherPhone;
    return (
      <a
        onClick={stopProp}
        href={waLink(phone!, resolveMessage(message, parent))}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(baseClasses, "bg-[#25D366] text-white hover:opacity-90")}
        title={parent === "father" ? "שליחה לאבא" : "שליחה לאמא"}
      >
        <MessageCircle size={activeSize} />
        {label && <span>{label}</span>}
        {Icon && <Icon size={iconSize} className="opacity-70" />}
      </a>
    );
  }

  return (
    <div onClick={stopProp}>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(baseClasses, "bg-[#25D366] text-white hover:opacity-90 w-full border-none cursor-pointer")}
          >
            <MessageCircle size={activeSize} />
            {label && <span>{label}</span>}
            {Icon && <Icon size={iconSize} className="opacity-70" />}
            <ChevronDown size={iconSize} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a
              href={waLink(fatherPhone!, resolveMessage(message, "father"))}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer flex items-center gap-2"
            >
              <MessageCircle size={14} />
              שלח לאבא
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={waLink(motherPhone!, resolveMessage(message, "mother"))}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer flex items-center gap-2"
            >
              <MessageCircle size={14} />
              שלח לאמא
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

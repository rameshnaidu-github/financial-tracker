// One module per icon keeps the bundle to the glyphs actually used.
import { Airplane } from "@phosphor-icons/react/dist/csr/Airplane";
import { ArrowCircleDown } from "@phosphor-icons/react/dist/csr/ArrowCircleDown";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowsLeftRight } from "@phosphor-icons/react/dist/csr/ArrowsLeftRight";
import { Bank } from "@phosphor-icons/react/dist/csr/Bank";
import { Basket } from "@phosphor-icons/react/dist/csr/Basket";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { Briefcase } from "@phosphor-icons/react/dist/csr/Briefcase";
import { CalendarCheck } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { Car } from "@phosphor-icons/react/dist/csr/Car";
import { Coffee } from "@phosphor-icons/react/dist/csr/Coffee";
import { CreditCard } from "@phosphor-icons/react/dist/csr/CreditCard";
import { FilmSlate } from "@phosphor-icons/react/dist/csr/FilmSlate";
import { Gift } from "@phosphor-icons/react/dist/csr/Gift";
import { GraduationCap } from "@phosphor-icons/react/dist/csr/GraduationCap";
import { Heartbeat } from "@phosphor-icons/react/dist/csr/Heartbeat";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { Lightning } from "@phosphor-icons/react/dist/csr/Lightning";
import { Money } from "@phosphor-icons/react/dist/csr/Money";
import { Question } from "@phosphor-icons/react/dist/csr/Question";
import { Receipt } from "@phosphor-icons/react/dist/csr/Receipt";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { ShoppingBag } from "@phosphor-icons/react/dist/csr/ShoppingBag";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { Ticket } from "@phosphor-icons/react/dist/csr/Ticket";
import { TrendUp } from "@phosphor-icons/react/dist/csr/TrendUp";
import { Wallet } from "@phosphor-icons/react/dist/csr/Wallet";
import { ForkKnife } from "@phosphor-icons/react/dist/csr/ForkKnife";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

type IconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

// Category glyphs, keyed by the icon ids stored with each Type/SubType (unchanged ids).
const iconMap: Record<string, PhosphorIcon> = {
  "shopping-basket": Basket,
  utensils: ForkKnife,
  ticket: Ticket,
  film: FilmSlate,
  car: Car,
  receipt: Receipt,
  "shopping-bag": ShoppingBag,
  "heart-pulse": Heartbeat,
  plane: Airplane,
  wallet: Wallet,
  "credit-card": CreditCard,
  "arrow-down-circle": ArrowCircleDown,
  "arrow-left-right": ArrowsLeftRight,
  "rotate-ccw": ArrowCounterClockwise,
  "circle-question": Question,
  home: House,
  "book-open": BookOpen,
  coffee: Coffee,
  gift: Gift,
  briefcase: Briefcase,
  landmark: Bank,
  banknote: Money,
  "trending-up": TrendUp,
  "calendar-clock": CalendarCheck,
  zap: Lightning,
  shield: ShieldCheck,
  "graduation-cap": GraduationCap,
  sparkles: Sparkle
};

export function IconGlyph({ name, size = 16, className }: IconProps & { name: string }) {
  const Glyph = iconMap[name] ?? Question;
  return <Glyph size={size} weight="regular" className={className ? `ui-icon ${className}` : "ui-icon"} />;
}

import {
  ArrowDownCircle,
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Briefcase,
  Car,
  CircleQuestionMark,
  Coffee,
  CreditCard,
  Film,
  Gift,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingBasket,
  Ticket,
  CalendarClock,
  TrendingUp,
  Utensils,
  Wallet
} from "lucide-react";
import type { ComponentType } from "react";

type IconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

const iconMap: Record<string, ComponentType<IconProps>> = {
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  ticket: Ticket,
  film: Film,
  car: Car,
  receipt: Receipt,
  "shopping-bag": ShoppingBag,
  "heart-pulse": HeartPulse,
  plane: Plane,
  wallet: Wallet,
  "credit-card": CreditCard,
  "arrow-down-circle": ArrowDownCircle,
  "arrow-left-right": ArrowLeftRight,
  "rotate-ccw": RotateCcw,
  "circle-question": CircleQuestionMark,
  home: Home,
  "book-open": BookOpen,
  coffee: Coffee,
  gift: Gift,
  briefcase: Briefcase,
  landmark: Landmark,
  banknote: Banknote,
  "trending-up": TrendingUp,
  "calendar-clock": CalendarClock
};

export function IconGlyph({ name, ...props }: IconProps & { name: string }) {
  const Icon = iconMap[name] ?? CircleQuestionMark;
  return <Icon {...props} />;
}

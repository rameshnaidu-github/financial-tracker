/*
 * The app's one icon family: Phosphor (regular weight), exported under the names the screens
 * already use so call sites stay unchanged. Every icon carries the `ui-icon` class for styling.
 */
// One module per icon keeps the bundle to the glyphs actually used.
import { Airplane } from "@phosphor-icons/react/dist/csr/Airplane";
import { Archive as PhArchive } from "@phosphor-icons/react/dist/csr/Archive";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowsDownUp } from "@phosphor-icons/react/dist/csr/ArrowsDownUp";
import { Bank } from "@phosphor-icons/react/dist/csr/Bank";
import { CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CalendarCheck } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { Check as PhCheck } from "@phosphor-icons/react/dist/csr/Check";
import { CircleNotch } from "@phosphor-icons/react/dist/csr/CircleNotch";
import { CreditCard as PhCreditCard } from "@phosphor-icons/react/dist/csr/CreditCard";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FileXls } from "@phosphor-icons/react/dist/csr/FileXls";
import { ForkKnife } from "@phosphor-icons/react/dist/csr/ForkKnife";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { Info as PhInfo } from "@phosphor-icons/react/dist/csr/Info";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Moon as PhMoon } from "@phosphor-icons/react/dist/csr/Moon";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PiggyBank as PhPiggyBank } from "@phosphor-icons/react/dist/csr/PiggyBank";
import { Plus as PhPlus } from "@phosphor-icons/react/dist/csr/Plus";
import { Question } from "@phosphor-icons/react/dist/csr/Question";
import { SlidersHorizontal as PhSlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { Sun as PhSun } from "@phosphor-icons/react/dist/csr/Sun";
import { Tag } from "@phosphor-icons/react/dist/csr/Tag";
import { Target as PhTarget } from "@phosphor-icons/react/dist/csr/Target";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { TrendUp } from "@phosphor-icons/react/dist/csr/TrendUp";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { UserCircle as PhUserCircle } from "@phosphor-icons/react/dist/csr/UserCircle";
import { Wallet } from "@phosphor-icons/react/dist/csr/Wallet";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { X as PhX } from "@phosphor-icons/react/dist/csr/X";
import type { Icon as PhosphorIcon, IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";

export type UiIconProps = Omit<IconProps, "ref"> & { size?: number; className?: string };
export type UiIcon = ComponentType<UiIconProps>;

function wrap(Glyph: PhosphorIcon, name: string): UiIcon {
  function UiIconGlyph({ className, weight = "regular", size = 18, ...rest }: UiIconProps) {
    return <Glyph {...rest} size={size} weight={weight} className={className ? `ui-icon ${className}` : "ui-icon"} />;
  }
  UiIconGlyph.displayName = name;
  return UiIconGlyph;
}

export const Archive = wrap(PhArchive, "Archive");
export const ArrowDownUp = wrap(ArrowsDownUp, "ArrowDownUp");
export const BarChart3 = wrap(ChartBar, "BarChart3");
export const CalendarClock = wrap(CalendarCheck, "CalendarClock");
export const CalendarDays = wrap(CalendarBlank, "CalendarDays");
export const Check = wrap(PhCheck, "Check");
export const ChevronDown = wrap(CaretDown, "ChevronDown");
export const ChevronLeft = wrap(CaretLeft, "ChevronLeft");
export const ChevronRight = wrap(CaretRight, "ChevronRight");
export const CircleAlert = wrap(WarningCircle, "CircleAlert");
export const CircleHelp = wrap(Question, "CircleHelp");
export const CreditCard = wrap(PhCreditCard, "CreditCard");
export const Download = wrap(DownloadSimple, "Download");
export const FileSpreadsheet = wrap(FileXls, "FileSpreadsheet");
export const Home = wrap(House, "Home");
export const Info = wrap(PhInfo, "Info");
export const Landmark = wrap(Bank, "Landmark");
export const LayoutGrid = wrap(SquaresFour, "LayoutGrid");
export const Loader2 = wrap(CircleNotch, "Loader2");
export const Moon = wrap(PhMoon, "Moon");
export const Pencil = wrap(PencilSimple, "Pencil");
export const PiggyBank = wrap(PhPiggyBank, "PiggyBank");
export const Plane = wrap(Airplane, "Plane");
export const Plus = wrap(PhPlus, "Plus");
export const RotateCcw = wrap(ArrowCounterClockwise, "RotateCcw");
export const Search = wrap(MagnifyingGlass, "Search");
export const SlidersHorizontal = wrap(PhSlidersHorizontal, "SlidersHorizontal");
export const Sun = wrap(PhSun, "Sun");
export const Tags = wrap(Tag, "Tags");
export const Target = wrap(PhTarget, "Target");
export const Trash2 = wrap(Trash, "Trash2");
export const TrendingUp = wrap(TrendUp, "TrendingUp");
export const Upload = wrap(UploadSimple, "Upload");
export const UserCircle = wrap(PhUserCircle, "UserCircle");
export const Utensils = wrap(ForkKnife, "Utensils");
export const WalletCards = wrap(Wallet, "WalletCards");
export const X = wrap(PhX, "X");

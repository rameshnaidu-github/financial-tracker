/**
 * What a typed correction means, for the two kinds of account it can be typed on.
 *
 * Its own module because the sign is the one part of this feature that can be wrong in a way
 * nobody notices: the dialog would still work, the transaction would still be written, and the
 * figure would move the opposite way from what the hint under the field promised. A pure
 * function here can be checked against what the server actually does to the account, which a
 * branch inside a 9,800-line component cannot.
 */
import type { Direction } from "./types";

/**
 * The ledger direction for a correction typed as `+` or `-`.
 *
 * The sign means "make the figure on screen move this way", and the figure on screen is not the
 * same thing on the two kinds of account:
 *
 * - A bank account shows what you **have**, so `+500` is money arriving: an inflow.
 * - A credit card shows what you **owe**, so `+500` is 500 more owed: an outflow on the card,
 *   the same shape a purchase has.
 *
 * Writing the card the other way round would make the hint under the field a lie, which is the
 * failure this function exists to make checkable.
 */
export function adjustmentDirection(
  isCard: boolean,
  typed: Direction
): Direction {
  if (!isCard) {
    return typed;
  }
  return typed === "inflow" ? "outflow" : "inflow";
}

/** How much the figure the reader is looking at moves, signed the way they typed it. */
export function adjustmentShiftPaise(paise: number, typed: Direction): number {
  return typed === "inflow" ? paise : -paise;
}

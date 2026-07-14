import type { ReportType } from "./types";

export const INFLOW_BEHAVIORS = new Set(["income", "refund"]);

export type CashflowPart = {
  id: string;
  name: string;
  amountPaise: number;
  color: string;
};

export function cashflowPartsFromTypes(types: ReportType[], tone: "in" | "out"): CashflowPart[] {
  const matchingTypes = types.filter((type) =>
    tone === "in" ? INFLOW_BEHAVIORS.has(type.behavior) : !INFLOW_BEHAVIORS.has(type.behavior)
  );

  const parts =
    tone === "in"
      ? matchingTypes.flatMap((type) =>
          type.subcategories.length > 0
            ? type.subcategories.map((subcategory) => ({
                id: `${type.typeId}:${subcategory.subcategoryId}`,
                name: subcategory.name,
                amountPaise: subcategory.amountPaise,
                color: subcategory.color
              }))
            : [
                {
                  id: type.typeId,
                  name: type.name,
                  amountPaise: type.amountPaise,
                  color: type.color
                }
              ]
        )
      : matchingTypes.map((type) => ({
          id: type.typeId,
          name: type.name,
          amountPaise: type.amountPaise,
          color: type.color
        }));

  return parts.filter((part) => part.amountPaise > 0).sort((a, b) => b.amountPaise - a.amountPaise);
}

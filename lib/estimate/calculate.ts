import { roundHalfUp } from "./money";
import type { EstimateLine, LinkedField, RuleSnapshot } from "./schema";

/**
 * Customer amount is rounded half-up to the cent once per unit, then the
 * extension is rounded again. Invoice-level tax is not added. Rental,
 * equipment, labor, and fuel ignore vendor markup. Formula mobilization is
 * (move-in + move-out) once; quantity does not multiply it again. Fixed
 * price does not also apply a percent.
 */

function taxDollars(line: EstimateLine): number {
    if (line.taxMode === "percent") return (line.cost * line.tax) / 100;
    return line.tax;
}

function withOutputs(
    line: EstimateLine,
    unit: number,
    total: number,
    internal: number,
    known: boolean,
    formula: string
): EstimateLine {
    return {
        ...line,
        customerUnitPrice: unit,
        customerTotal: total,
        internalTotal: internal,
        internalKnown: known,
        formula,
    };
}

export function calculateLine(line: EstimateLine): EstimateLine {
    if (line.pricingMode === "fixed") {
        const unit = roundHalfUp(line.rate);
        return withOutputs(
            line,
            unit,
            roundHalfUp(unit * line.quantity),
            0,
            false,
            "fixed price"
        );
    }

    if (line.customerUnitOverridden && line.category !== "mobilization") {
        const unit = roundHalfUp(line.customerUnitPrice);
        const internal = internalOf(line);
        return withOutputs(
            line,
            unit,
            roundHalfUp(unit * line.quantity),
            internal.total,
            internal.known,
            "manual rate"
        );
    }

    switch (line.category) {
        case "vendor": {
            const markup = line.markupWaived ? 1 : line.markup;
            const unit = roundHalfUp((line.cost + taxDollars(line)) * markup);
            const internalUnit = roundHalfUp(line.cost + taxDollars(line));
            return withOutputs(
                line,
                unit,
                roundHalfUp(unit * line.quantity),
                roundHalfUp(internalUnit * line.quantity),
                true,
                line.markupWaived
                    ? "(cost + vendor sales tax) × 1 (markup waived)"
                    : "(cost + vendor sales tax) × markup"
            );
        }
        case "rental":
        case "labor":
        case "equipment": {
            const unit = roundHalfUp(line.rate);
            const total = roundHalfUp(unit * line.quantity);
            return withOutputs(
                line,
                unit,
                total,
                total,
                true,
                "rate × quantity (no markup)"
            );
        }
        case "fuel": {
            const unit = roundHalfUp(line.dieselPrice + line.fuelAdder);
            const known = line.dieselPrice > 0;
            const internal = known
                ? roundHalfUp(roundHalfUp(line.dieselPrice) * line.quantity)
                : 0;
            return withOutputs(
                line,
                unit,
                roundHalfUp(unit * line.quantity),
                internal,
                known,
                "gallons × (diesel + adder)"
            );
        }
        case "mobilization": {
            const percent = line.markupWaived ? 0 : line.mobilizationPercent;
            const base = line.moveIn + line.moveOut;
            const total = line.customerUnitOverridden
                ? roundHalfUp(line.customerUnitPrice)
                : roundHalfUp(base * (1 + percent));
            const waived = line.markupWaived || percent === 0;
            return withOutputs(
                { ...line, quantity: 1, unit: "job" },
                total,
                total,
                roundHalfUp(base),
                true,
                line.customerUnitOverridden
                    ? "manual rate"
                    : waived
                      ? "(move-in + move-out) × 1 (markup waived)"
                      : "(move-in + move-out) × (1 + percent)"
            );
        }
        default: {
            const never: never = line.category;
            return never;
        }
    }
}

function internalOf(line: EstimateLine): { total: number; known: boolean } {
    if (line.category === "vendor") {
        const internalUnit = roundHalfUp(line.cost + taxDollars(line));
        return {
            total: roundHalfUp(internalUnit * line.quantity),
            known: true,
        };
    }
    if (line.category === "fuel") {
        if (line.dieselPrice <= 0) return { total: 0, known: false };
        return {
            total: roundHalfUp(roundHalfUp(line.dieselPrice) * line.quantity),
            known: true,
        };
    }
    if (line.category === "mobilization") {
        return { total: roundHalfUp(line.moveIn + line.moveOut), known: true };
    }
    const unit = roundHalfUp(line.rate);
    return { total: roundHalfUp(unit * line.quantity), known: true };
}

export function snapshotValue(
    line: EstimateLine,
    rules: RuleSnapshot,
    field: LinkedField
): number | undefined {
    if (field === "markup") return rules.vendorMarkup;
    if (field === "dieselPrice") return rules.dieselPricePerGallon;
    if (field === "fuelAdder") return rules.fuelAdderPerGallon;
    if (field === "mobilizationPercent") return rules.mobilizationPercent;
    if (field === "rate" && line.category === "labor") {
        return rules.laborRatePerHour;
    }
    if (
        field === "rate" &&
        line.category === "equipment" &&
        line.catalogItemId
    ) {
        return rules.equipment.find((item) => item.id === line.catalogItemId)
            ?.rate;
    }
    return undefined;
}

const LINKED: Record<EstimateLine["category"], LinkedField[]> = {
    vendor: ["markup"],
    rental: [],
    fuel: ["dieselPrice", "fuelAdder"],
    labor: ["rate"],
    equipment: ["rate"],
    mobilization: ["mobilizationPercent"],
};

function sameNumber(a: number, b: number): boolean {
    return Math.abs(a - b) < 1e-9;
}

export function editLine(
    line: EstimateLine,
    patch: Partial<EstimateLine>,
    rules: RuleSnapshot
): EstimateLine {
    const next: EstimateLine = { ...line, ...patch };
    const overridden = new Set(line.overriddenFields);
    for (const field of LINKED[next.category]) {
        if (!(field in patch)) continue;
        const snap = snapshotValue(next, rules, field);
        const value = next[field];
        if (snap === undefined || typeof value !== "number") {
            overridden.add(field);
        } else if (sameNumber(value, snap)) {
            overridden.delete(field);
        } else {
            overridden.add(field);
        }
    }
    next.overriddenFields = [...overridden];
    return calculateLine(next);
}

function defaultUnit(category: EstimateLine["category"]): string {
    switch (category) {
        case "vendor":
            return "ea";
        case "rental":
            return "day";
        case "fuel":
            return "gal";
        case "labor":
        case "equipment":
            return "hr";
        case "mobilization":
            return "job";
        default: {
            const never: never = category;
            return never;
        }
    }
}

export function createLine(
    category: EstimateLine["category"],
    rules: RuleSnapshot,
    seed: Partial<EstimateLine> = {}
): EstimateLine {
    const catalog =
        category === "equipment" && seed.catalogItemId
            ? rules.equipment.find((item) => item.id === seed.catalogItemId)
            : undefined;
    const line: EstimateLine = {
        id: seed.id ?? crypto.randomUUID(),
        category,
        serviceDate: seed.serviceDate ?? "",
        name: seed.name ?? catalog?.name ?? "",
        description: seed.description ?? "",
        quantity: seed.quantity ?? 1,
        unit: seed.unit ?? catalog?.unit ?? defaultUnit(category),
        pricingMode: seed.pricingMode ?? "formula",
        markupWaived: seed.markupWaived ?? false,
        cost: seed.cost ?? 0,
        taxMode: seed.taxMode ?? "percent",
        tax: seed.tax ?? 0,
        markup: seed.markup ?? rules.vendorMarkup,
        rate:
            seed.rate ??
            catalog?.rate ??
            (category === "labor" ? rules.laborRatePerHour : 0),
        dieselPrice: seed.dieselPrice ?? rules.dieselPricePerGallon,
        fuelAdder: seed.fuelAdder ?? rules.fuelAdderPerGallon,
        moveIn: seed.moveIn ?? 0,
        moveOut: seed.moveOut ?? 0,
        mobilizationPercent:
            seed.mobilizationPercent ?? rules.mobilizationPercent,
        catalogItemId: seed.catalogItemId ?? null,
        overriddenFields: seed.overriddenFields ?? [],
        customerUnitOverridden: seed.customerUnitOverridden ?? false,
        customerUnitPrice: seed.customerUnitPrice ?? 0,
        customerTotal: 0,
        internalTotal: 0,
        internalKnown: false,
        formula: "",
    };
    return calculateLine(line);
}

export function resetLine(
    line: EstimateLine,
    rules: RuleSnapshot
): EstimateLine {
    return createLine(line.category, rules, {
        id: line.id,
        serviceDate: line.serviceDate,
        name: line.name,
        description: line.description,
        quantity: line.category === "mobilization" ? 1 : line.quantity,
        cost: line.cost,
        taxMode: line.taxMode,
        tax: line.tax,
        moveIn: line.moveIn,
        moveOut: line.moveOut,
        catalogItemId: line.catalogItemId,
        pricingMode: "formula",
        markupWaived: false,
        customerUnitOverridden: false,
        overriddenFields: [],
    });
}

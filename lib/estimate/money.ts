/**
 * Cent rounding for estimate money.
 *
 * Binary floats make `(1.005).toFixed(2)` come out as "1.00". Amounts are
 * turned into a decimal string and rounded half away from zero at the cent.
 */

function decimalString(value: number): string {
    const abs = Math.abs(value);
    let text = abs.toString();
    if (/e/i.test(text)) {
        text = abs.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
    }
    return text;
}

/** Integer millionths of a dollar (1e-6). Truncates extra digits; rounding happens later. */
function toMicroDollars(value: number): bigint {
    const negative = value < 0;
    const [whole, fraction = ""] = decimalString(value).split(".");
    const micro =
        BigInt(whole || "0") * 1_000_000n +
        BigInt((fraction + "000000").slice(0, 6));
    return negative ? -micro : micro;
}

/**
 * Round half away from zero to the nearest cent.
 * `1.005` → `1.01`, `1.004` → `1.00`.
 */
export function roundHalfUp(dollars: number): number {
    if (!Number.isFinite(dollars)) {
        throw new Error("Amount must be a finite number");
    }
    const micro = toMicroDollars(dollars);
    const negative = micro < 0n;
    const abs = negative ? -micro : micro;
    const cents = abs / 10_000n;
    const remainder = abs % 10_000n;
    const rounded = remainder >= 5_000n ? cents + 1n : cents;
    const result = Number(rounded) / 100;
    return negative ? -result : result;
}

/** Sum already-rounded dollar amounts by adding integer cents. */
export function sumMoney(values: number[]): number {
    let cents = 0n;
    for (const value of values) {
        const rounded = roundHalfUp(value);
        const negative = rounded < 0;
        const absCents = BigInt(
            Math.round(Math.abs(rounded) * 100 + Number.EPSILON)
        );
        cents += negative ? -absCents : absCents;
    }
    const negative = cents < 0n;
    const dollars = Number(negative ? -cents : cents) / 100;
    return negative ? -dollars : dollars;
}

export function formatMoney(dollars: number): string {
    const rounded = roundHalfUp(dollars);
    return rounded.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatQuantity(value: number): string {
    if (!Number.isFinite(value)) return "";
    const rounded = Math.round(value * 100) / 100;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

export function formatPercent(value: number): string {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 100) / 100;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

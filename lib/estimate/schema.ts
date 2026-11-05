import { z } from "zod";

import { isIsoDate } from "./dates";

/**
 * RW Grading estimate.
 *
 * Rates live on the quote's ruleSnapshot. Editing the global catalog does
 * nothing to a quote until Apply defaults. Fixed price and markup waiver are
 * per line so an older job can keep an exception without becoming the default.
 *
 * Deposit default text is the sourced policy: COD, 30% to schedule. It is
 * copied onto the quote and stays editable. 50% is not the catalog default.
 */

export const ESTIMATE_SCHEMA_VERSION = 1 as const;
export const JOB_FILE_KIND = "rwg-estimate" as const;
export const MAX_JOB_FILE_BYTES = 4 * 1024 * 1024;
export const SUGGESTED_EXCAVATOR_ID = "excavator-normal";

export const CATEGORIES = [
    "vendor",
    "rental",
    "fuel",
    "labor",
    "equipment",
    "mobilization",
] as const;

export const LINKED_FIELDS = [
    "markup",
    "dieselPrice",
    "fuelAdder",
    "rate",
    "mobilizationPercent",
] as const;

const money = z.number().finite();
const imageDataUrl = z
    .string()
    .max(1_500_000)
    .refine(
        (value) =>
            value === "" || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value),
        { message: "Image must be an embedded image" }
    );

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate = z
    .string()
    .max(10)
    .refine((value) => value === "" || isIsoDate(value), {
        message: "Date must be blank or YYYY-MM-DD",
    });

export const equipmentRateSchema = z
    .object({
        id: z.string().min(1).max(80),
        name: z.string().min(1).max(120),
        rate: money.nonnegative(),
        unit: z.string().min(1).max(20),
    })
    .strict();

export const ruleSnapshotSchema = z
    .object({
        schemaVersion: z.literal(ESTIMATE_SCHEMA_VERSION),
        vendorMarkup: money.nonnegative(),
        fuelAdderPerGallon: money.nonnegative(),
        dieselPricePerGallon: money.nonnegative(),
        laborRatePerHour: money.nonnegative(),
        mobilizationPercent: money.nonnegative().max(5),
        validityDays: z.number().int().min(0).max(3650),
        depositPercent: money.nonnegative().max(100),
        equipment: z.array(equipmentRateSchema).max(50),
    })
    .strict();

export const lineSchema = z
    .object({
        id: z.string().uuid(),
        category: z.enum(CATEGORIES),
        serviceDate: optionalDate,
        name: z.string().max(200),
        description: z.string().max(40_000),
        quantity: money,
        unit: z.string().max(40),
        pricingMode: z.enum(["formula", "fixed"]),
        markupWaived: z.boolean(),
        cost: money,
        taxMode: z.enum(["amount", "percent"]),
        tax: money,
        markup: money,
        rate: money,
        dieselPrice: money,
        fuelAdder: money,
        moveIn: money,
        moveOut: money,
        mobilizationPercent: money,
        catalogItemId: z.string().max(80).nullable(),
        overriddenFields: z.array(z.enum(LINKED_FIELDS)).max(8),
        customerUnitOverridden: z.boolean(),
        customerUnitPrice: money,
        customerTotal: money,
        internalTotal: money,
        internalKnown: z.boolean(),
        formula: z.string().max(240),
    })
    .strict();

const addressSchema = z
    .object({
        name: z.string().max(200),
        address: z.string().max(300),
        city: z.string().max(120),
        region: z.string().max(120),
        postalCode: z.string().max(20),
        phone: z.string().max(40),
        email: z.string().max(200),
    })
    .strict();

export const senderSchema = addressSchema
    .extend({ website: z.string().max(200) })
    .strict();

export const customerSchema = addressSchema
    .extend({ jobSite: z.string().max(300) })
    .strict();

export const estimateSchema = z
    .object({
        schemaVersion: z.literal(ESTIMATE_SCHEMA_VERSION),
        id: z.string().uuid(),
        quoteId: z.string().uuid(),
        revision: z.number().int().positive().max(10_000),
        status: z.enum(["draft", "issued"]),
        issuedAt: z.string().max(40).nullable(),
        basedOn: z
            .object({
                id: z.string().uuid(),
                revision: z.number().int().positive(),
            })
            .strict()
            .nullable(),
        createdAt: z.string().min(10).max(40),
        updatedAt: z.string().min(10).max(40),
        estimateNumber: z.string().min(1).max(40),
        estimateDate: isoDate,
        validityDays: z.number().int().min(0).max(3650),
        validThrough: isoDate,
        validityDaysOverridden: z.boolean(),
        expirationOverridden: z.boolean(),
        headerOverridden: z.boolean(),
        sender: senderSchema,
        customer: customerSchema,
        scope: z.string().max(40_000),
        lines: z.array(lineSchema).max(200),
        depositPercent: money.nonnegative().max(100),
        depositPercentOverridden: z.boolean(),
        depositTerms: z.string().max(4_000),
        depositTermsOverridden: z.boolean(),
        depositAmount: money.nullable(),
        depositAmountOverridden: z.boolean(),
        customerNotes: z.string().max(40_000),
        exclusions: z.string().max(40_000),
        internalNotes: z.string().max(20_000),
        acceptedBy: z.string().max(200),
        acceptedDate: optionalDate,
        signatureDataUrl: imageDataUrl,
        logoDataUrl: imageDataUrl,
        ruleSnapshot: ruleSnapshotSchema,
        customerTotal: money,
        internalTotal: money,
        profit: money,
        profitKnown: z.boolean(),
    })
    .strict();

export const catalogSchema = z
    .object({
        schemaVersion: z.literal(ESTIMATE_SCHEMA_VERSION),
        sender: senderSchema,
        rules: ruleSnapshotSchema,
    })
    .strict();

export const jobFileSchema = z
    .object({
        kind: z.literal(JOB_FILE_KIND),
        schemaVersion: z.literal(ESTIMATE_SCHEMA_VERSION),
        exportedAt: z.string().min(10).max(40),
        estimate: estimateSchema,
    })
    .strict();

export type Category = (typeof CATEGORIES)[number];
export type LinkedField = (typeof LINKED_FIELDS)[number];
export type EquipmentRate = z.infer<typeof equipmentRateSchema>;
export type RuleSnapshot = z.infer<typeof ruleSnapshotSchema>;
export type EstimateLine = z.infer<typeof lineSchema>;
export type EstimateSender = z.infer<typeof senderSchema>;
export type EstimateCustomer = z.infer<typeof customerSchema>;
export type EstimateDocument = z.infer<typeof estimateSchema>;
export type EstimateCatalog = z.infer<typeof catalogSchema>;
export type JobFile = z.infer<typeof jobFileSchema>;

/** Public letterhead from the estimate template. Not a customer record. */
export const SUGGESTED_SENDER: EstimateSender = {
    name: "RW Grading LLC",
    address: "260 Thompson Rd",
    city: "Taylors",
    region: "SC",
    postalCode: "29687",
    email: "RWGradingSeptic@gmail.com",
    phone: "864-660-3419",
    website: "rwgrading.com",
};

/**
 * Editable starting catalog. Excavator $100/hr is the Nov 3 normal-job rate.
 * Diesel starts at 0 because no current pump price was supplied.
 */
export const SUGGESTED_RULES: RuleSnapshot = {
    schemaVersion: ESTIMATE_SCHEMA_VERSION,
    vendorMarkup: 1.1,
    fuelAdderPerGallon: 2,
    dieselPricePerGallon: 0,
    laborRatePerHour: 25,
    mobilizationPercent: 0.2,
    validityDays: 30,
    depositPercent: 30,
    equipment: [
        {
            id: SUGGESTED_EXCAVATOR_ID,
            name: "Excavator (normal job)",
            rate: 100,
            unit: "hr",
        },
    ],
};

export const SUGGESTED_CATALOG: EstimateCatalog = {
    schemaVersion: ESTIMATE_SCHEMA_VERSION,
    sender: SUGGESTED_SENDER,
    rules: SUGGESTED_RULES,
};

export function emptyCustomer(): EstimateCustomer {
    return {
        name: "",
        address: "",
        city: "",
        region: "",
        postalCode: "",
        phone: "",
        email: "",
        jobSite: "",
    };
}

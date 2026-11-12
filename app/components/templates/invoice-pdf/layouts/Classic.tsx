import { RW_GRADING_LOGO_PATH } from "@/lib/rwGradingLogo";
import { letterheadLines, RW_LETTERHEAD } from "@/lib/estimate/letterhead";

import TemplateFrame, {
    templateCtx,
    type TemplateProps,
} from "../TemplateFrame";
import {
    ContactFooter,
    DocumentMeta,
    ItemsTable,
    NotesBlock,
    PartyBlock,
    PaymentBlock,
    SignatureBlock,
    TotalsBlock,
} from "../parts";

/**
 * Default invoice. The header band, logo, type, and grays come from the
 * shared estimate letterhead. Invoice number, dates, and payment stay.
 */
export default function Classic(props: TemplateProps) {
    const base = templateCtx(props);
    const ctx = {
        ...base,
        theme: { ...base.theme, accentColor: RW_LETTERHEAD.rule },
    };
    const { data, labels } = ctx;
    const { sender, details } = data;
    const website = sender.customInputs?.find(
        (input) => input.key.trim().toLowerCase() === "website"
    )?.value;
    const lines = letterheadLines({
        name: sender.name,
        address: sender.address,
        city: sender.city,
        region: sender.country,
        postalCode: sender.zipCode,
        email: sender.email,
        phone: sender.phone,
        website,
    });
    const extra = (sender.customInputs ?? []).filter(
        (input) => input.key.trim().toLowerCase() !== "website" && input.value.trim()
    );
    const logo = details.invoiceLogo || RW_GRADING_LOGO_PATH;

    return (
        <TemplateFrame
            ctx={ctx}
            fontFamily={RW_LETTERHEAD.fontFamily}
            color={RW_LETTERHEAD.text}
        >
            <header className="flex items-start justify-between gap-4">
                <div
                    data-edit-field="sender.name"
                    style={{ fontSize: "10.5pt", lineHeight: 1.25 }}
                >
                    {lines.map((line, index) => (
                        <div
                            key={`${index}-${line}`}
                            style={{ fontWeight: index === 0 ? 700 : 400 }}
                        >
                            {line}
                        </div>
                    ))}
                    {extra.map((input) => (
                        <div key={input.key}>
                            {input.key}: {input.value}
                        </div>
                    ))}
                </div>
                <img
                    src={logo}
                    alt={labels.logoAlt.replace("{name}", sender.name)}
                    data-letterhead-logo=""
                    style={{ width: RW_LETTERHEAD.logoWidth, height: "auto" }}
                />
            </header>

            <div
                style={{
                    margin: "16px 0 8px",
                    fontSize: RW_LETTERHEAD.titleSize,
                    fontWeight: RW_LETTERHEAD.titleWeight,
                    color: RW_LETTERHEAD.title,
                    lineHeight: 1.1,
                }}
            >
                Invoice
            </div>

            <div className="flex items-start justify-between gap-6">
                <PartyBlock
                    ctx={ctx}
                    field="receiver"
                    party={data.receiver}
                    heading={labels.billTo}
                    letter
                />
                <DocumentMeta ctx={ctx} align="right" letter />
            </div>

            <div className="mt-3">
                <ItemsTable ctx={ctx} headerBg={RW_LETTERHEAD.tableHeader} />
            </div>

            <div className="mt-4 flex justify-end">
                <div className="w-full sm:w-1/2">
                    <TotalsBlock ctx={ctx} />
                </div>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <NotesBlock ctx={ctx} />
                <PaymentBlock ctx={ctx} />
            </div>

            <div className="mt-6 flex items-end justify-between gap-6">
                <ContactFooter ctx={ctx} />
                <SignatureBlock ctx={ctx} />
            </div>
        </TemplateFrame>
    );
}

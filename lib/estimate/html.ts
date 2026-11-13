import { formatUsDate } from "./dates";
import { RW_LETTERHEAD } from "./letterhead";
import { formatMoney } from "./money";
import {
    customerLines,
    senderLines,
    type CustomerEstimateView,
} from "./view";

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function safeLogo(src: string): string {
    if (src.startsWith("data:image/") || src.startsWith("/assets/")) return src;
    return "";
}

function exclusionItems(text: string): string[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[•*-]\s*/, ""));
}

function changeOrderNumber(view: CustomerEstimateView): string {
    return view.changeOrderNumber.trim() || view.estimateNumber.trim();
}

function documentTitle(view: CustomerEstimateView): string {
    return view.documentType === "change-order" ? "Change Order" : "Estimate";
}

function metaRows(view: CustomerEstimateView): string {
    if (view.documentType === "change-order") {
        const original = view.originalEstimateNumber.trim();
        return `<tr><td class="k">CHANGE ORDER #</td><td>${escapeHtml(changeOrderNumber(view))}</td></tr>
      <tr><td class="k">DATE</td><td>${escapeHtml(formatUsDate(view.estimateDate))}</td></tr>
      ${
          original
              ? `<tr><td class="k">ORIGINAL ESTIMATE #</td><td>${escapeHtml(original)}</td></tr>`
              : ""
      }`;
    }
    return `<tr><td class="k">ESTIMATE #</td><td>${escapeHtml(view.estimateNumber)}</td></tr>
      <tr><td class="k">DATE</td><td>${escapeHtml(formatUsDate(view.estimateDate))}</td></tr>
      <tr><td class="k">EXPIRATION DATE</td><td>${escapeHtml(formatUsDate(view.validThrough))}</td></tr>`;
}

function totalLabel(view: CustomerEstimateView): string {
    return view.documentType === "change-order" ? "NET CHANGE" : "TOTAL";
}

/**
 * Customer estimate HTML. Layout follows the sent US Letter estimate:
 * business header and logo, gray Estimate title, address and meta,
 * seven-column table, notes and total, acceptance lines.
 * Internal fields are not arguments to this function.
 */
export function customerEstimateHtml(view: CustomerEstimateView): string {
    const logo = safeLogo(view.logoSrc);
    const title = documentTitle(view);
    const rows = view.lines
        .map((line) => {
            const date = formatUsDate(line.serviceDate);
            return `<tr>
<td>${escapeHtml(date)}</td>
<td class="activity">${escapeHtml(line.activity)}</td>
<td class="desc">${escapeHtml(line.description)}</td>
<td class="num">${escapeHtml(line.quantityLabel)}</td>
<td class="num">${escapeHtml(line.unit)}</td>
<td class="num">${escapeHtml(formatMoney(line.rate))}</td>
<td class="num">${escapeHtml(formatMoney(line.amount))}</td>
</tr>`;
        })
        .join("");
    const exclusions = exclusionItems(view.exclusions)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");
    const jobSite = view.customer.jobSite.trim();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} ${escapeHtml(view.documentType === "change-order" ? changeOrderNumber(view) : view.estimateNumber)}</title>
<style>
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    color: ${RW_LETTERHEAD.text};
    font-family: ${RW_LETTERHEAD.fontFamily};
    font-size: 10.5pt;
    line-height: 1.3;
  }
  .sheet { padding: 0.15in 0.05in 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .biz { font-size: 10.5pt; line-height: 1.25; }
  .biz .name { font-weight: 700; }
  .logo { width: ${RW_LETTERHEAD.logoWidth}; height: auto; display: block; }
  h1 {
    margin: 16px 0 8px;
    font-size: ${RW_LETTERHEAD.titleSize};
    font-weight: ${RW_LETTERHEAD.titleWeight};
    color: ${RW_LETTERHEAD.title};
    letter-spacing: 0;
  }
  .meta { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .label { font-weight: 700; font-size: 10pt; }
  .addr p, .job p { margin: 0; }
  .meta-table { margin-left: auto; border-collapse: collapse; }
  .meta-table td { padding: 0 0 1px 14px; vertical-align: baseline; white-space: nowrap; }
  .meta-table .k { font-weight: 700; text-align: right; }
  .rule { border: 0; border-top: 1.5px solid ${RW_LETTERHEAD.rule}; margin: 8px 0; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines thead { display: table-header-group; }
  table.lines th {
    background: ${RW_LETTERHEAD.tableHeader};
    font-size: 8.5pt;
    font-weight: 700;
    text-align: left;
    padding: 4px 6px;
  }
  table.lines th.num, table.lines td.num { text-align: right; white-space: nowrap; }
  table.lines td { vertical-align: top; padding: 8px 6px; font-size: 10pt; }
  table.lines td.activity { font-weight: 700; }
  table.lines td.desc { white-space: pre-wrap; }
  table.lines thead, .accept, .band { break-inside: avoid; page-break-inside: avoid; }
  table.lines tr { break-inside: auto; page-break-inside: auto; }
  .band { display: flex; justify-content: space-between; align-items: flex-start; gap: 28px; }
  .notes { flex: 1 1 auto; max-width: 70%; }
  .notes h2 { font-size: 10.5pt; margin: 8px 0 2px; }
  .notes p { margin: 0 0 8px; white-space: pre-wrap; }
  .notes ul { margin: 2px 0 0; padding-left: 18px; }
  .totalbox { text-align: right; min-width: 160px; padding-top: 8px; }
  .totalbox .label { font-size: 11pt; }
  .totalbox .amt { font-weight: 700; font-size: 16pt; margin-top: 6px; }
  .accept { display: flex; justify-content: space-between; gap: 48px; margin-top: 42px; }
  .accept div { flex: 1; }
  .accept .line { border-bottom: 1px solid #222; min-height: 18px; margin-bottom: 3px; }
  .accept .cap { font-size: 10pt; }
</style>
</head>
<body data-template="rwg-estimate">
<div class="sheet">
  <div class="header">
    <div class="biz">
      ${senderLines(view.sender)
          .map((line, index) =>
              index === 0
                  ? `<div class="name">${escapeHtml(line)}</div>`
                  : `<div>${escapeHtml(line)}</div>`
          )
          .join("")}
    </div>
    ${logo ? `<img class="logo" alt="RW Grading Estimates" src="${escapeHtml(logo)}" />` : ""}
  </div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <div>
      <div class="label">ADDRESS</div>
      <div class="addr">
        ${customerLines(view.customer)
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join("")}
      </div>
      ${
          jobSite
              ? `<div class="job"><div class="label">JOB ADDRESS</div><p>${escapeHtml(jobSite)}</p></div>`
              : ""
      }
    </div>
    <table class="meta-table">
      ${metaRows(view)}
    </table>
  </div>
  <hr class="rule" />
  <table class="lines">
    <thead>
      <tr>
        <th>DATE</th>
        <th>ACTIVITY</th>
        <th>DESCRIPTION</th>
        <th class="num">QTY</th>
        <th class="num">UNIT</th>
        <th class="num">RATE</th>
        <th class="num">AMOUNT</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <hr class="rule" />
  <div class="band">
    <div class="notes">
      <h2>NOTES / TERMS</h2>
      <p>${escapeHtml(view.notes)}</p>
      <h2>EXCLUSIONS</h2>
      ${exclusions ? `<ul>${exclusions}</ul>` : ""}
    </div>
    <div class="totalbox">
      <div class="label">${escapeHtml(totalLabel(view))}</div>
      <div class="amt">${escapeHtml(formatMoney(view.total))}</div>
    </div>
  </div>
  <div class="accept">
    <div>
      <div class="line">${escapeHtml(view.acceptedBy)}</div>
      <div class="cap">Accepted By</div>
    </div>
    <div>
      <div class="line">${escapeHtml(formatUsDate(view.acceptedDate))}</div>
      <div class="cap">Accepted Date</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

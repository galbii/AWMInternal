// Letter export builders — ported verbatim from source-3-letter-pipeline.js.
// S3: 303–350 (shareSummaryHTML + the offer-packet document builder),
// 358–385 (letterDocHTML), 508–528 (email compose helpers).
//
// Deviation 2 (globals → params): the source saved/restored the `L` / `curRec`
// globals around each builder; here every builder resolves the letter itself.
// The localStorage email-client preference (S3 509–510) stays out — storage.ts owns it.

import type { LetterRenderOpts, OfferRecord } from '@/lib/offers/types'
import { esc } from '@/lib/offers/format'
import { DATA_FIELDS, GROUPS } from '@/lib/offers/schema'
import { LETTER_FOOT, letterInnerFor, resolveLetter } from '@/lib/offers/letter'
import { PRINT_CONTENT_H_PT, fitCss, planLetterFit } from '@/lib/offers/letter-fit'

/* ---- self-contained shareable export (current record + its offer letter) ---- */
// S3 303–308
function shareSummaryHTML(rec: OfferRecord): string {
  const d = rec.data
  let h = ''
  GROUPS.forEach((g) => {
    const fs = DATA_FIELDS.filter((f) => f.g === g.n && d[f.id] && String(d[f.id]).trim())
    if (!fs.length) return
    h += '<div class="sgrp"><h3>' + esc(g.title) + '</h3><table class="stab">'
    fs.forEach((f) => {
      h +=
        '<tr><td class="k">' +
        esc(f.label) +
        '</td><td class="v">' +
        esc(String(d[f.id])).replace(/\n/g, '<br>') +
        '</td></tr>'
    })
    h += '</table></div>'
  })
  return h || '<p>No details entered yet.</p>'
}

// S3 309–313
function buildLetterStandaloneHTML(rec: OfferRecord, official: boolean): string {
  const body = letterInnerFor(rec, resolveLetter(rec, official))
  return (
    '<table class="letter-table"><tfoot><tr><td><div class="lp-foot">' +
    LETTER_FOOT +
    '</div></td></tr></tfoot><tbody><tr><td>' +
    body +
    '</td></tr></tbody></table>'
  )
}

// S3 314–350 — exportShareHTML minus the download/toast side effects.
//
// ASYNC since 2026-09-27. The packet's own Print / Save as PDF button has to land
// on one page like every other path, and CSS cannot measure — so the fit is
// resolved HERE, in the browser that is building the file, and baked in as static
// CSS. The packet ships no fit code of its own and needs none: the sheet it shows
// on screen is already the one-page result it will print.
/**
 * The packet's watermark bootstrap. PURE, and exported so the rule can be
 * tested without a browser (offerPacketHTML itself measures layout).
 *
 * A stamped packet renders the layer on load and binds NOTHING: the original
 * shipped `WM={on:false}` plus a checkbox, so a draft letter exported to HTML
 * arrived clean AND handed its recipient a control over the watermark.
 */
export function packetWatermarkJs(stamped: boolean, text: string): string {
  const rwm =
    "function rwm(){var wl=document.getElementById('wmLayer');if(!WM.on){wl.className='wm';wl.innerHTML='';return;}wl.className='wm on';var h=(document.querySelector('.sheet').scrollHeight)||1100;var n=(Math.ceil(h/120)+2)*6;var s='';for(var i=0;i<n;i++){s+='<span>'+WM.text+'</span>';}wl.innerHTML='<div class=\"wmi\">'+s+'</div>';}"
  return (
    'var WM={on:' +
    (stamped ? 'true' : 'false') +
    ',text:' +
    JSON.stringify(text) +
    '};' +
    rwm +
    (stamped
      ? 'rwm();'
      : "document.getElementById('wmOn').onchange=function(){WM.on=this.checked;rwm();};document.getElementById('wmSel').onchange=function(){WM.text=this.value;rwm();};")
  )
}

/** The packet toolbar's watermark control — a fixed notice once stamped. */
export function packetWatermarkControl(stamped: boolean, text: string): string {
  if (stamped) {
    return '<span class="wm-fixed">' + esc(text) + ' — not an official offer letter</span>'
  }
  return (
    '<label><input type="checkbox" id="wmOn"> Watermark</label>' +
    '<select id="wmSel"><option>SAMPLE</option><option>PROOF</option><option>DRAFT</option><option>COPY</option><option>CONFIDENTIAL</option></select>'
  )
}

export async function offerPacketHTML(
  rec: OfferRecord,
  opts: LetterRenderOpts = {},
): Promise<{ name: string; doc: string }> {
  const name = rec.data.employeeName || 'New Hire'
  // The packet used to ship `WM={on:false}` and a checkbox, so a draft letter
  // exported to HTML arrived clean AND handed its recipient a control to
  // toggle a watermark it never had. The stamp is baked in now: when the
  // letter is a draft the control is gone and the layer renders on load.
  const official = opts.official !== false
  const L = resolveLetter(rec, official)
  const stamped = opts.stamp === true || !!(L.watermark && L.watermark.on)
  const wmText = (L.watermark && L.watermark.text) || 'SAMPLE'
  const letterHTML = buildLetterStandaloneHTML(rec, official)
  const summaryHTML = shareSummaryHTML(rec)
  // Measured against the app's letter.css, whose `ul` margin is 2px looser than
  // the packet's — so the packet always renders a hair SHORTER than measured,
  // which is the safe direction to be wrong in.
  const fit = await planLetterFit(letterHTML, PRINT_CONTENT_H_PT)
  const fitVars = Object.keys(fit.step.vars)
    .map((k) => k + ':' + fit.step.vars[k])
    .join(';')
  const css =
    '*{box-sizing:border-box}body{margin:0;background:#5b6675;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111}' +
    '.ctrl{position:sticky;top:0;z-index:10;background:#1b2a4a;color:#fff;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 16px}' +
    '.ctrl strong{font-size:15px}.ctrl .sp{flex:1}.ctrl label{display:flex;align-items:center;gap:6px;font-size:13px;background:rgba(255,255,255,.12);padding:5px 10px;border-radius:7px}' +
    '.ctrl select{padding:6px 8px;border-radius:6px;border:1px solid #2a3a5c}.ctrl button{cursor:pointer;border:none;border-radius:7px;padding:8px 14px;font-weight:600;background:#2f5fd0;color:#fff;font-size:13px}' +
    // A stamped packet states why, where the toggle used to be.
    '.wm-fixed{font-size:12.5px;font-weight:600;letter-spacing:.02em;background:rgba(216,31,42,.22);border:1px solid rgba(255,190,190,.45);color:#ffe2e2;padding:5px 10px;border-radius:7px}' +
    // Padding = the @page margin below, so the on-screen sheet is the print.
    '.sheet{position:relative;background:#fff;width:8.5in;min-height:11in;margin:26px auto;box-shadow:0 6px 30px rgba(0,0,0,.35);padding:.472in .556in}' +
    '.letter-content{font-family:Calibri,Segoe UI,Arial,sans-serif;font-size:11pt;line-height:1.42;position:relative;z-index:2}' +
    '.letter-table{width:100%;border-collapse:collapse}.letter-table>tbody>tr>td,.letter-table>tfoot>tr>td{padding:0;border:none}' +
    '.lp-foot{text-align:center;font-size:8.5pt;color:#333;line-height:1.35;padding-top:16px}' +
    '.letter-content .logo{width:2.5in;margin:0 0 18px}.letter-content .date-line{text-align:right;margin-bottom:14px}' +
    '.letter-content p{margin:0 0 9px}.letter-content .addr div{line-height:1.35}.letter-content h3.sec{font-size:12.5pt;font-weight:700;margin:16px 0 8px}' +
    '.letter-content ul{margin:0 0 9px;padding-left:22px}.letter-content ul li{margin-bottom:4px}' +
    '.comp-table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:10pt}.comp-table th,.comp-table td{border:1px solid #b9c2d0;padding:7px 9px;vertical-align:top;text-align:left}' +
    '.comp-table th{background:#eef2f9;font-weight:700}.comp-table td:first-child{font-weight:700;width:20%}.comp-table td:nth-child(2){width:34%}' +
    '.comp-plan .cp-line{margin:0 0 9px}.cp-pct{font-weight:700}.sig-name{margin-top:2px}.letter-content .ack{margin-top:26px}' +
    '.wm{position:absolute;inset:0;overflow:hidden;z-index:1;pointer-events:none;display:none}.wm.on{display:block}' +
    '.wmi{position:absolute;top:-25%;left:-25%;width:150%;height:150%;display:flex;flex-wrap:wrap;gap:70px 46px;transform:rotate(-30deg)}' +
    '.wmi span{color:rgba(200,30,30,.12);font-size:46px;font-weight:800;letter-spacing:5px;white-space:nowrap;font-family:Arial}' +
    '.summary{max-width:8.5in;margin:0 auto 40px;background:#fff;border-radius:12px;padding:20px 26px;box-shadow:0 6px 30px rgba(0,0,0,.25)}' +
    '.summary h2{margin:0 0 12px;color:#1b2a4a}.sgrp h3{margin:16px 0 6px;color:#1b2a4a;font-size:14px;border-bottom:1px solid #e2e7ef;padding-bottom:4px}' +
    '.stab{width:100%;border-collapse:collapse;font-size:13px}.stab td{padding:5px 8px;border-bottom:1px solid #f0f2f6;vertical-align:top}.stab .k{width:38%;color:#516079;font-weight:600}' +
    '@media print{.ctrl,.summary{display:none!important}body{background:#fff}.sheet{box-shadow:none;margin:0;width:auto;min-height:0;padding:0}@page{size:letter;margin:.472in .556in}}' +
    // The baked fit: the step's spacing variables, and the width/zoom pair that
    // reproduces what the PDF gets by rasterizing wide and mapping down.
    '.sheet .letter-content{' +
    fitVars +
    '}' +
    '@supports (zoom:1){.sheet .letter-content{width:' +
    fit.step.widthPx +
    'px;zoom:' +
    fit.step.zoom +
    '}}' +
    fitCss('.sheet .letter-content')
  const js = packetWatermarkJs(stamped, wmText)
  const doc =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offer Packet — ' +
    esc(name) +
    '</title><style>' +
    css +
    '</style></head><body>' +
    '<div class="ctrl"><strong>Offer Packet — ' +
    esc(name) +
    '</strong><span class="sp"></span>' +
    packetWatermarkControl(stamped, wmText) +
    '<button onclick="window.print()">Print / Save as PDF</button></div>' +
    '<div class="sheet"><div class="wm" id="wmLayer"></div><div class="letter-content">' +
    letterHTML +
    '</div></div>' +
    '<div class="summary"><h2>Request Details</h2>' +
    summaryHTML +
    '</div>' +
    '<script>' +
    js +
    '</script></body></html>'
  return { name, doc }
}

/* ---- export the current offer letter as an editable Word document ---- */
// Build the full Word (.doc) HTML for one record. wm={on,text} adds a light SAMPLE watermark.
// S3 358–385
//
// THE ONE PATH THAT CANNOT BE GUARANTEED ONE PAGE. Word owns its own pagination
// and there is no measure-then-scale hook to reach it from HTML — `<w:Zoom>` is a
// view setting and does not follow to the printer. So this export is pinned to
// fixed compressed metrics (~the middle of letter-fit's ladder, roughly a third
// off the port's spacing) while KEEPING 11pt body copy: a .doc exists to be
// edited, and a document handed over at 8.5pt would be the wrong trade. Short and
// mid-length letters land on one page; the fullest ones still run to two.

// Word reads inline styles and is unreliable about `!important`, so the three
// spacing declarations `generateLetterHTML` writes inline are rewritten here
// rather than merely overridden. Exact declarations, emitted by our own builder
// (letter.ts) — keep in step with it. A hand-edited letter whose markup the
// browser has since normalized falls through to the CSS below, which is why
// both exist.
function compactInlineSpacing(body: string): string {
  return body
    .replace(/margin-bottom:22px/g, 'margin-bottom:8px')
    .replace(/margin-top:48px/g, 'margin-top:16px')
    .replace(/margin-top:34px/g, 'margin-top:12px')
}

export function letterDocHTML(
  rec: OfferRecord,
  opts: LetterRenderOpts = {},
): { name: string; doc: string } {
  const name = rec.data.employeeName || 'New Hire'
  // Was `letterDocHTML(rec, null)` at the only call site, so the Word export
  // silently dropped the record's own watermark. It reads the resolved config
  // now, like every other path.
  const L = resolveLetter(rec, opts.official !== false)
  if (opts.stamp) L.watermark = { on: true, text: (L.watermark && L.watermark.text) || 'SAMPLE' }
  const wm = L.watermark && L.watermark.on ? L.watermark : null
  const body = compactInlineSpacing(letterInnerFor(rec, L))
  const wmHtml =
    wm && wm.on
      ? "<div style='position:absolute;top:36%;left:0;width:100%;text-align:center;transform:rotate(-30deg);color:#d81f2a;opacity:0.12;font-size:96pt;font-weight:bold;z-index:0'>" +
        esc(wm.text || 'SAMPLE') +
        '</div>'
      : ''
  const letterHTML = body + "<div class='lp-foot'>" + LETTER_FOOT + '</div>'
  // Margins match letter-fit.ts's page box; the rest is the port's own metrics
  // compressed, so the Word file and the PDF read as the same document.
  const css =
    '@page{size:8.5in 11.0in;margin:0.472in 0.556in 0.472in 0.556in}' +
    'body{font-family:Calibri,Arial,sans-serif;font-size:11.0pt;color:#111111;line-height:1.24}' +
    'p{margin:0 0 3.5pt 0}' +
    'img.logo{width:1.9in;height:auto}' +
    '.date-line{text-align:right;margin-bottom:5pt}' +
    '.addr{margin-bottom:6pt!important}' +
    '.addr div{line-height:1.15}' +
    'h3.sec{font-size:11.5pt;font-weight:bold;margin:6pt 0 3pt 0}' +
    'ul{margin:0 0 4pt 0}' +
    'li{margin-bottom:1pt}' +
    'table.comp-table{border-collapse:collapse;width:100%;margin:3pt 0 5pt 0;font-size:9.0pt}' +
    'table.comp-table td,table.comp-table th{border:1px solid #b9c2d0;padding:2.5pt;vertical-align:top;text-align:left}' +
    'table.comp-table th{background:#eef2f9;font-weight:bold}' +
    'table.comp-table td:first-child{font-weight:bold}' +
    '.cp-pct{font-weight:bold}' +
    '.cp-line{margin:0 0 3pt 0}' +
    '.sig-block{margin-top:9pt}' +
    '.ack{margin-top:9pt!important}' +
    '.lp-foot{text-align:center;font-size:8.5pt;color:#333333;margin-top:8pt}' +
    'table.letter-table{width:100%;border-collapse:collapse}table.letter-table>tbody>tr>td,table.letter-table>tfoot>tr>td{border:none;padding:0}'
  const doc =
    "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>" +
    "<head><meta charset='utf-8'><title>Offer Letter - " +
    esc(name) +
    '</title>' +
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->' +
    '<style>' +
    css +
    '</style></head><body>' +
    wmHtml +
    "<div class='letter-content' style='position:relative;z-index:1'>" +
    letterHTML +
    '</div></body></html>'
  return { name: name, doc: doc }
}

/* ---- The default email, as the source worded it ----
   S3's compose helpers (511–519: the mailto: deeplink for desktop Outlook and
   the OWA compose URL) are GONE — the app sends the letter itself now, through
   SendLetterModal -> /api/offer-email. The subject and body below survive
   because they are the source's WORDING, not its transport, and they are still
   what the composer opens with. */

// S3 520
export function offerEmailSubject(_rec: OfferRecord): string {
  return 'Your Offer of Employment — All Western Mortgage'
}

// S3 521–528
export function offerEmailBody(rec: OfferRecord): string {
  const d = (rec && rec.data) || {}
  const first =
    (d.preferredName && d.preferredName.trim()) ||
    (d.employeeName || '').trim().split(/\s+/)[0] ||
    'there'
  return (
    'Hi ' +
    first +
    ',\n\n' +
    'Congratulations! We’re excited to extend your offer of employment with All Western Mortgage. ' +
    'Your offer letter is attached — please review the details and let me know if you have any questions.\n\n' +
    'To accept, sign and return the letter at your earliest convenience. We look forward to welcoming you aboard.\n\n' +
    'Warm regards,\n'
  )
}

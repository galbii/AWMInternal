// Letter export builders — ported verbatim from source-3-letter-pipeline.js.
// S3: 303–350 (shareSummaryHTML + the offer-packet document builder),
// 358–385 (letterDocHTML), 508–528 (email compose helpers).
//
// Deviation 2 (globals → params): the source saved/restored the `L` / `curRec`
// globals around each builder; here every builder resolves the letter itself.
// The localStorage email-client preference (S3 509–510) stays out — storage.ts owns it.

import type { OfferRecord, WatermarkOpt } from '@/lib/offers/types'
import { esc } from '@/lib/offers/format'
import { DATA_FIELDS, GROUPS } from '@/lib/offers/schema'
import { LETTER_FOOT, letterInnerFor, resolveLetter } from '@/lib/offers/letter'

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
function buildLetterStandaloneHTML(rec: OfferRecord): string {
  const body = letterInnerFor(rec, resolveLetter(rec))
  return (
    '<table class="letter-table"><tfoot><tr><td><div class="lp-foot">' +
    LETTER_FOOT +
    '</div></td></tr></tfoot><tbody><tr><td>' +
    body +
    '</td></tr></tbody></table>'
  )
}

// S3 314–350 — exportShareHTML minus the download/toast side effects.
export function offerPacketHTML(rec: OfferRecord): { name: string; doc: string } {
  const name = rec.data.employeeName || 'New Hire'
  const letterHTML = buildLetterStandaloneHTML(rec)
  const summaryHTML = shareSummaryHTML(rec)
  const css =
    '*{box-sizing:border-box}body{margin:0;background:#5b6675;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111}' +
    '.ctrl{position:sticky;top:0;z-index:10;background:#1b2a4a;color:#fff;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 16px}' +
    '.ctrl strong{font-size:15px}.ctrl .sp{flex:1}.ctrl label{display:flex;align-items:center;gap:6px;font-size:13px;background:rgba(255,255,255,.12);padding:5px 10px;border-radius:7px}' +
    '.ctrl select{padding:6px 8px;border-radius:6px;border:1px solid #2a3a5c}.ctrl button{cursor:pointer;border:none;border-radius:7px;padding:8px 14px;font-weight:600;background:#2f5fd0;color:#fff;font-size:13px}' +
    '.sheet{position:relative;background:#fff;width:8.5in;min-height:11in;margin:26px auto;box-shadow:0 6px 30px rgba(0,0,0,.35);padding:.6in .75in .7in}' +
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
    '@media print{.ctrl,.summary{display:none!important}body{background:#fff}.sheet{box-shadow:none;margin:0;width:auto;min-height:0;padding:0}@page{size:letter;margin:.55in .7in .55in}}'
  const js =
    "var WM={on:false,text:'SAMPLE'};function rwm(){var wl=document.getElementById('wmLayer');if(!WM.on){wl.className='wm';wl.innerHTML='';return;}wl.className='wm on';var h=(document.querySelector('.sheet').scrollHeight)||1100;var n=(Math.ceil(h/120)+2)*6;var s='';for(var i=0;i<n;i++){s+='<span>'+WM.text+'</span>';}wl.innerHTML='<div class=\"wmi\">'+s+'</div>';}document.getElementById('wmOn').onchange=function(){WM.on=this.checked;rwm();};document.getElementById('wmSel').onchange=function(){WM.text=this.value;rwm();};"
  const doc =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offer Packet — ' +
    esc(name) +
    '</title><style>' +
    css +
    '</style></head><body>' +
    '<div class="ctrl"><strong>Offer Packet — ' +
    esc(name) +
    '</strong><span class="sp"></span>' +
    '<label><input type="checkbox" id="wmOn"> Watermark</label>' +
    '<select id="wmSel"><option>SAMPLE</option><option>PROOF</option><option>DRAFT</option><option>COPY</option><option>CONFIDENTIAL</option></select>' +
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
export function letterDocHTML(
  rec: OfferRecord,
  wm: WatermarkOpt | null,
): { name: string; doc: string } {
  const name = rec.data.employeeName || 'New Hire'
  const body = letterInnerFor(rec, resolveLetter(rec))
  const wmHtml =
    wm && wm.on
      ? "<div style='position:absolute;top:36%;left:0;width:100%;text-align:center;transform:rotate(-30deg);color:#d81f2a;opacity:0.12;font-size:96pt;font-weight:bold;z-index:0'>" +
        esc(wm.text || 'SAMPLE') +
        '</div>'
      : ''
  const letterHTML = body + "<div class='lp-foot'>" + LETTER_FOOT + '</div>'
  const css =
    '@page{size:8.5in 11.0in;margin:0.7in 0.75in 0.7in 0.75in}' +
    'body{font-family:Calibri,Arial,sans-serif;font-size:11.0pt;color:#111111}' +
    'p{margin:0 0 8pt 0}' +
    'img.logo{width:2.4in;height:auto}' +
    '.date-line{text-align:right;margin-bottom:10pt}' +
    '.addr div{line-height:1.2}' +
    'h3.sec{font-size:12.5pt;font-weight:bold;margin:12pt 0 6pt 0}' +
    'ul{margin:0 0 8pt 0}' +
    'table.comp-table{border-collapse:collapse;width:100%;margin:6pt 0 10pt 0;font-size:10.0pt}' +
    'table.comp-table td,table.comp-table th{border:1px solid #b9c2d0;padding:6pt;vertical-align:top;text-align:left}' +
    'table.comp-table th{background:#eef2f9;font-weight:bold}' +
    'table.comp-table td:first-child{font-weight:bold}' +
    '.cp-pct{font-weight:bold}' +
    '.ack{margin-top:20pt}' +
    '.lp-foot{text-align:center;font-size:8.5pt;color:#333333;margin-top:14pt}' +
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

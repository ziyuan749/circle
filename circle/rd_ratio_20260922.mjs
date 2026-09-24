import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
import JSZip from 'jszip';

const outputDir = '/Users/xzy1035395556/Desktop/circle/outputs/rd_ratio_20260922';

const reports = [
  ['天奇股份', '2023全年', 3616202637.44, 135660300.03, '2023年报·合并利润表（印刷页117—118）', 'https://static.cninfo.com.cn/finalpage/2024-04-26/1219828704.PDF'],
  ['天奇股份', '2024全年', 2960284283.49, 115314889.67, '2024年报·合并利润表', 'https://static.cninfo.com.cn/finalpage/2025-04-25/1223268300.PDF'],
  ['天奇股份', '2025全年', 2763268943.07, 127908726.32, '2025年报·合并利润表（印刷页98—99）', 'https://disc.static.szse.cn/disc/disk03/finalpage/2026-04-28/d5f71ad9-1942-4648-8885-d3663df684b5.PDF'],
  ['天奇股份', '2026上半年', 1460700859.37, 75723060.29, '2026半年报·合并利润表', 'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=12534021&stockid=002009'],
  ['格林美', '2023全年', 30528634731.12, 1202843402.65, '2023年报·合并利润表（印刷页173）', 'https://static.cninfo.com.cn/finalpage/2024-04-27/1219871582.PDF'],
  ['格林美', '2024全年', 33199829363.58, 1101208712.45, '2024年报·合并利润表', 'https://static.cninfo.com.cn/finalpage/2025-04-26/1223332818.PDF'],
  ['格林美', '2025全年', 37123584782.33, 1205803686.75, '2025年报·合并利润表（印刷页144—145）', 'https://disc.static.szse.cn/download/disc/disk03/finalpage/2026-04-22/b4675097-7e47-4cc6-898b-281ace34ff8f.PDF'],
  ['格林美', '2026上半年', 17986991903.42, 632071112.31, '2026半年报·合并利润表（印刷页82）', 'https://disc.static.szse.cn/disc/disk03/finalpage/2026-08-29/a0ef8a99-b96d-40ed-9684-db5a39ac745b.PDF'],
];

const wb = Workbook.create();
const sheet = wb.worksheets.add('研发费率');
sheet.showGridLines = false;
sheet.tabColor = '#183653';

sheet.getRange('A1:H16').format.font = { name: 'Arial', size: 10, color: '#1D2939' };
sheet.getRange('A2').values = [['天奇股份与格林美研发费率']];
sheet.getRange('A2').format.font = { name: 'Arial', size: 14, bold: true, color: '#183653' };
sheet.getRange('A3').values = [['口径：合并利润表研发费用 ÷ 合并利润表营业收入；金额单位：人民币元']];
sheet.getRange('A3').format.font = { name: 'Arial', size: 10, italic: true, color: '#526174' };
sheet.getRange('A4:H4').format.borders = { bottom: { style: 'thin', color: '#B9C8D6' } };

sheet.getRange('A5:H5').values = [['公司', '报告期', '营业收入（元）', '研发费用（元）', '研发费率', '报告位置', '打开报告', '报告原文链接']];
sheet.getRange('A5:H5').format.fill = '#183653';
sheet.getRange('A5:H5').format.font = { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' };
sheet.getRange('A5:H5').format.horizontalAlignment = 'center';
sheet.getRange('A5:H5').format.verticalAlignment = 'center';

for (let i = 0; i < reports.length; i++) {
  const row = i + 6;
  const [company, period, revenue, rd, location, url] = reports[i];
  sheet.getRange(`A${row}:D${row}`).values = [[company, period, revenue, rd]];
  sheet.getRange(`E${row}`).formulas = [[`=D${row}/C${row}`]];
  sheet.getRange(`F${row}`).values = [[location]];
  sheet.getRange(`G${row}`).formulas = [[`=HYPERLINK(H${row},"查看报告")`]];
  sheet.getRange(`H${row}`).values = [[url]];
  sheet.getRange(`A${row}:H${row}`).format.fill = i % 2 ? '#F3F7FA' : '#FFFFFF';
  sheet.getRange(`C${row}:D${row}`).format.font = { name: 'Arial', size: 10, color: '#1E5AA8' };
  sheet.getRange(`G${row}:H${row}`).format.font = { name: 'Arial', size: 10, color: '#175CD3', underline: 'single' };
}

sheet.getRange('A10:H10').format.borders = { top: { style: 'medium', color: '#8BA2B8' } };
sheet.getRange('C6:D13').setNumberFormat('#,##0.00');
sheet.getRange('E6:E13').setNumberFormat('0.00%');
sheet.getRange('E6:E13').format.font = { name: 'Arial', size: 10, bold: true, italic: true, color: '#183653' };
sheet.getRange('C6:E13').format.horizontalAlignment = 'right';
sheet.getRange('A6:B13').format.horizontalAlignment = 'left';
sheet.getRange('F6:H13').format.horizontalAlignment = 'left';
sheet.getRange('A5:H13').format.verticalAlignment = 'center';
sheet.getRange('A5:H5').format.rowHeight = 28;
sheet.getRange('A6:H13').format.rowHeight = 25;

sheet.getRange('A15').values = [['注：2026上半年为1月1日至6月30日累计数，未年化。研发费用为费用化金额，不含资本化研发投入。']];
sheet.getRange('A15').format.font = { name: 'Arial', size: 10, italic: true, color: '#526174' };

const widths = { A: 14, B: 15, C: 22, D: 22, E: 13, F: 43, G: 13, H: 75 };
for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}:${col}`).format.columnWidth = width;

wb.recalculate();
const check = await wb.inspect({ kind: 'table', range: '研发费率!A5:H13', include: 'values,formulas', tableMaxRows: 10, tableMaxCols: 8, maxChars: 6500 });
console.log(check.ndjson);
const errors = await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!', options: { useRegex: true, maxResults: 100 }, maxChars: 1000 });
console.log('ERROR_SCAN', errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
for (let row = 6; row <= 13; row++) sheet.getRange(`G${row}`).values = [['查看报告']];
const preview = await wb.render({ sheetName: '研发费率', range: 'A1:H15', scale: 1, format: 'png' });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));
for (let row = 6; row <= 13; row++) sheet.getRange(`G${row}`).formulas = [[`=HYPERLINK(H${row},"查看报告")`]];
wb.recalculate();
const output = await SpreadsheetFile.exportXlsx(wb);
const filePath = `${outputDir}/天奇股份_格林美_研发费率_2023-2026H1.xlsx`;
await output.save(filePath);

// The workbook engine can export HYPERLINK formulas but cannot calculate their
// display values. Supply Excel with the correct cached label for each link.
const zip = await JSZip.loadAsync(await fs.readFile(filePath));
let xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
for (let row = 6; row <= 13; row++) {
  const start = xml.indexOf(`<x:c r="G${row}"`);
  const end = xml.indexOf('</x:c>', start) + '</x:c>'.length;
  if (start < 0 || end < 0) throw new Error(`Missing link cell G${row}`);
  const oldCell = xml.slice(start, end);
  const style = oldCell.match(/ s="(\d+)"/)?.[1];
  xml = xml.slice(0, start) + `<x:c r="G${row}" s="${style}" t="str"><x:f>HYPERLINK(H${row},"查看报告")</x:f><x:v>查看报告</x:v></x:c>` + xml.slice(end);
}
zip.file('xl/worksheets/sheet1.xml', xml);
await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));

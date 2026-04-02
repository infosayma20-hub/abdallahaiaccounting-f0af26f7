/**
 * Reusable print utility - opens a new window with clean print layout
 * Removes about:blank, browser headers/footers (date, URL, page title)
 */
export function printReport(options: {
  title: string;
  companyName: string;
  contentHtml: string;
  logoUrl?: string;
}) {
  const { title, companyName, contentHtml } = options;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title} - ${companyName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    
    @media print {
      @page {
        size: A4 landscape;
        margin: 0;
      }
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Cairo', Arial, sans-serif;
      direction: rtl;
      color: #1a2332;
      background: white;
      padding: 15mm 20mm;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    
    .print-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #0D1B2E;
    }
    .company-name { font-size: 18px; font-weight: 700; color: #0D1B2E; }
    .report-title { font-size: 13px; color: #64748b; margin-top: 2px; }
    .print-date { font-size: 11px; color: #94a3b8; }
    
    .summary-row {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 16px;
      min-width: 120px;
    }
    .summary-label { font-size: 10px; color: #64748b; }
    .summary-value { font-size: 14px; font-weight: 700; color: #0D1B2E; }
    .summary-value.green { color: #059669; }
    .summary-value.red { color: #DC2626; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead th {
      background: #f1f5f9;
      padding: 8px 10px;
      text-align: right;
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
      white-space: nowrap;
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    tbody tr:nth-child(even) { background: #fafbfc; }
    tfoot td {
      padding: 8px 10px;
      font-weight: 700;
      font-size: 12px;
      border-top: 2px solid #e2e8f0;
      background: #f8fafc;
    }
    
    .text-green { color: #059669; }
    .text-red { color: #DC2626; }
    .text-primary { color: #1a56db; }
    .text-muted { color: #94a3b8; }
    .text-left { text-align: left; }
    .font-mono { font-family: 'Cairo', monospace; }
    .font-bold { font-weight: 700; }
    
    .print-footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  ${contentHtml}
  <div class="print-footer">
    <span>طبع بتاريخ: ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
    <span>${companyName}</span>
  </div>
</body>
</html>`);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 600);
}

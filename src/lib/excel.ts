import * as XLSX from "xlsx";
import { ExtractionResult } from "../types";

export function exportToExcel(data: ExtractionResult[], fileName: string = "AI_Ops_Report.xlsx") {
  const worksheet = XLSX.utils.json_to_sheet(data.map(item => ({
    "Email ID": item.email_id,
    "Name": item.name,
    "Date": item.date,
    "Amount": item.amount,
    "Category": item.category,
    "Status": item.status,
    "Errors": item.validation_errors.join(", "),
    "Source": item.source_type
  })));
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
  
  XLSX.writeFile(workbook, fileName);
}

export async function readFromExcel(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const allRows: string[] = [];

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          const sheetRows = jsonData
            .filter(row => row.length > 0)
            .map(row => `[Sheet: ${sheetName}] ${row.join(" ")}`);
          
          allRows.push(...sheetRows);
        });
          
        resolve(allRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}

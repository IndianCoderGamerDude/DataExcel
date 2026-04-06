import { ExtractionResult, CATEGORIES } from "../types";
import { parse, isValid, format } from "date-fns";

export function validateData(data: Partial<ExtractionResult>): {
  valid: boolean;
  errors: string[];
  coerced: ExtractionResult;
} {
  const errors: string[] = [];
  const fallbacks: string[] = [];
  
  // Name
  let name = (data.name || "").trim();
  if (!name) {
    name = "Unknown";
    errors.push("Field 'name' is missing or empty.");
    fallbacks.push("name defaulted to 'Unknown'");
  } else if (name.length < 2) {
    errors.push(`Field 'name' ("${name}") is too short.`);
  }

  // Date
  let dateStr = "1970-01-01";
  if (data.date) {
    try {
      const parsed = new Date(data.date);
      if (isValid(parsed)) {
        dateStr = format(parsed, "yyyy-MM-dd");
      } else {
        errors.push(`Invalid date format: "${data.date}". Expected YYYY-MM-DD.`);
        fallbacks.push("date defaulted to 1970-01-01");
      }
    } catch (e) {
      errors.push(`Could not parse date: "${data.date}". Error: ${e instanceof Error ? e.message : "Unknown"}`);
      fallbacks.push("date defaulted to 1970-01-01");
    }
  } else {
    errors.push("Field 'date' is missing.");
    fallbacks.push("date defaulted to 1970-01-01");
  }

  // Amount
  let amount = 0;
  if (typeof data.amount === "number") {
    amount = data.amount;
  } else if (typeof data.amount === "string") {
    const val = data.amount as string;
    const cleanVal = val.replace(/[^0-9.-]+/g, "");
    const parsed = parseFloat(cleanVal);
    if (!isNaN(parsed)) {
      amount = parsed;
    } else {
      errors.push(`Invalid amount format: "${val}". Could not parse as number.`);
      fallbacks.push("amount defaulted to 0");
    }
  } else {
    errors.push("Field 'amount' is missing or invalid type.");
    fallbacks.push("amount defaulted to 0");
  }

  // Category
  let category: any = data.category;
  if (!category || !CATEGORIES.includes(category)) {
    const original = category;
    category = "other";
    errors.push(`Invalid category: "${original}". Allowed: ${CATEGORIES.join(", ")}.`);
    fallbacks.push(`category "${original}" defaulted to 'other'`);
  }

  const coerced: ExtractionResult = {
    name,
    date: dateStr,
    amount,
    category,
    email_id: data.email_id || "PENDING",
    status: errors.length === 0 ? "success" : "warning",
    validation_errors: errors,
    fallback_reason: fallbacks.length > 0 ? fallbacks.join("; ") : undefined,
    source_type: data.source_type || "text",
  };

  return {
    valid: errors.length === 0,
    errors,
    coerced,
  };
}

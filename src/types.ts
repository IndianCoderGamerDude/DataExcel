export type Category = "invoice" | "payment" | "refund" | "other";
export type ModelProvider = "gemini" | "ollama" | "claude";

export interface ExtractionResult {
  name: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: Category;
  email_id: string;
  status: "success" | "warning" | "error";
  validation_errors: string[];
  fallback_reason?: string;
  source_type: "text" | "image";
  projectId?: string;
}

export interface Project {
  id: string;
  title: string;
  creator: string;
  createdAt: string;
  icon: string;
  starCount: number;
  status: "active" | "completed" | "archived";
}

export interface ProcessingState {
  processed: number;
  failed: number;
  duplicates: number;
  total_amount: number;
}

export const CATEGORIES: Category[] = ["invoice", "payment", "refund", "other"];

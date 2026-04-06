/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from "recharts";
import { 
  Mail, FileText, Upload, Play, Download, Trash2, 
  CheckCircle2, AlertCircle, XCircle, Info, 
  BarChart3, LayoutDashboard, History, Settings,
  Volume2, Image as ImageIcon, Loader2,
  FolderKanban, Star, Clock, User, Plus, Save
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import { ExtractionResult, Category, CATEGORIES, Project, ModelProvider } from "./types";
import { extractFromEmail, analyzeInvoiceImage, speakSummary } from "./lib/ai";
import { exportToExcel, readFromExcel } from "./lib/excel";
import { cn } from "./lib/utils";
import { encryptData, decryptData } from "./lib/security";

const COLORS = {
  invoice: "#3b82f6",
  payment: "#10b981",
  refund: "#f59e0b",
  other: "#6b7280",
};

const INITIAL_PROJECTS: Project[] = [
  { id: "1", title: "Book Reviews", creator: "bea...", createdAt: "April 6, 2026 at 02:22 PM", icon: "book", starCount: 417, status: "active" },
  { id: "2", title: "Event Planner", creator: "bea...", createdAt: "March 27, 2026 at 05:47 PM", icon: "calendar", starCount: 204, status: "active" },
  { id: "3", title: "Sign In + Out Template", creator: "bea...", createdAt: "April 6, 2026 at 01:35 PM", icon: "laptop", starCount: 357, status: "active" },
  { id: "4", title: "Web Api Tutorial", creator: "bea...", createdAt: "April 6, 2026 at 03:07 AM", icon: "plug", starCount: 71, status: "active" },
  { id: "5", title: "Drawing App", creator: "bea...", createdAt: "April 4, 2026 at 07:58 PM", icon: "pencil", starCount: 292, status: "active" },
  { id: "6", title: "Image Recognizer", creator: "bea...", createdAt: "April 6, 2026 at 12:45 PM", icon: "image", starCount: 155, status: "active" },
  { id: "7", title: "Flashcard App", creator: "bea...", createdAt: "April 5, 2026 at 07:39 PM", icon: "cards", starCount: 94, status: "active" },
  { id: "8", title: "Travel App", creator: "bea...", createdAt: "April 4, 2026 at 02:57 PM", icon: "globe", starCount: 141, status: "active" },
  { id: "9", title: "Quote Estimator App", creator: "bea...", createdAt: "February 4, 2026 at 09:18 PM", icon: "dollar", starCount: 31, status: "active" },
  { id: "10", title: "Expense Tracker", creator: "bea...", createdAt: "April 3, 2026 at 02:02 PM", icon: "wallet", starCount: 62, status: "active" },
];

export default function App() {
  const [emailInput, setEmailInput] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<{ time: string; msg: string; type: "info" | "success" | "error" | "warning" }[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "input" | "history" | "settings" | "projects">("dashboard");
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    batchSize: 50,
    autoSpeak: false,
    theme: "technical",
    duplicateDetection: true,
    provider: "gemini" as ModelProvider,
  });

  const addLog = useCallback((msg: string, type: "info" | "success" | "error" | "warning" = "info") => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 50));
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/status");
        const data = await res.json();
        setIsAuthenticated(data.isAuthenticated);
      } catch (e) {
        console.error("Error checking auth status:", e);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        setIsAuthenticated(true);
        addLog("Gmail connected successfully!", "success");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [addLog]);

  const [duplicateCount, setDuplicateCount] = useState(0);

  const handleSaveSession = useCallback(() => {
    const encrypted = encryptData(JSON.stringify(results));
    localStorage.setItem("AI_OPS_SESSION", encrypted);
    addLog("Session saved securely (encrypted).", "success");
  }, [results, addLog]);

  const handleLoadSession = useCallback(() => {
    const encrypted = localStorage.getItem("AI_OPS_SESSION");
    if (encrypted) {
      try {
        const decrypted = decryptData(encrypted);
        const loadedResults = JSON.parse(decrypted);
        setResults(loadedResults);
        addLog("Session loaded and decrypted successfully.", "success");
      } catch (e) {
        addLog("Failed to decrypt session data.", "error");
      }
    } else {
      addLog("No saved session found.", "warning");
    }
  }, [addLog]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && activeTab === "input") {
        e.preventDefault();
        handleProcessText();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSaveSession();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && activeTab === "history") {
        e.preventDefault();
        // Focus search if we had one
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, emailInput, results]);

  const processResult = useCallback((result: ExtractionResult, sourceName: string) => {
    // Fallback detection
    if (result.fallback_reason) {
      addLog(`Fallback used for ${result.email_id}: ${result.fallback_reason}`, "warning");
    }

    // Duplicate detection
    if (settings.duplicateDetection && results.some(r => r.email_id === result.email_id)) {
      addLog(`Duplicate detected: ${result.email_id}. Skipping entry from ${sourceName}.`, "warning");
      setDuplicateCount(prev => prev + 1);
      return;
    }

    setResults(prev => [result, ...prev]);
    addLog(`Successfully processed: ${sourceName}`, "success");
  }, [addLog, results, settings.duplicateDetection]);

  const handleConnectGmail = async () => {
    try {
      const res = await fetch(`/api/auth/google/url?origin=${encodeURIComponent(window.location.origin)}`);
      const data = await res.json();
      
      if (data.error) {
        addLog(data.error, "error");
        if (data.error.includes("not configured")) {
          setActiveTab("settings");
        }
        return;
      }

      const authWindow = window.open(data.url, "gmail_oauth", "width=600,height=700");
      if (!authWindow) {
        alert("Please allow popups to connect Gmail.");
        return;
      }

      // Monitor window closure
      const timer = setInterval(() => {
        if (authWindow.closed) {
          clearInterval(timer);
          // Check auth status again after window closes
          fetch("/api/auth/status")
            .then(r => r.json())
            .then(d => {
              if (!d.isAuthenticated) {
                addLog("Gmail connection was not completed. Check if popups are blocked or if your Google Client ID is valid.", "warning");
              }
            });
        }
      }, 1000);

    } catch (e) {
      console.error("Error connecting Gmail:", e);
      addLog("Failed to connect Gmail. Check your internet connection.", "error");
    }
  };

  const handleFetchGmailInvoices = async () => {
    setIsProcessing(true);
    addLog("Fetching invoices from Gmail...", "info");
    try {
      const res = await fetch("/api/gmail/invoices");
      if (!res.ok) throw new Error("Failed to fetch invoices");
      const { invoices } = await res.json();
      addLog(`Found ${invoices.length} potential invoices in Gmail.`, "info");

      for (const inv of invoices) {
        addLog(`Processing Gmail message: ${inv.subject}...`, "info");
        const result = await extractFromEmail(inv.snippet, customInstructions, settings.provider);
        if (selectedProjectId) result.projectId = selectedProjectId;
        processResult(result, `Gmail: ${inv.subject}`);
      }
    } catch (e) {
      console.error("Error fetching Gmail invoices:", e);
      addLog("Failed to fetch Gmail invoices.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const stats = useMemo(() => {
    const total = results.length;
    const success = results.filter(r => r.status === "success").length;
    const warnings = results.filter(r => r.status === "warning").length;
    const errors = results.filter(r => r.status === "error").length;
    const totalAmount = results.reduce((sum, r) => sum + r.amount, 0);
    const duplicates = duplicateCount;

    return { total, success, warnings, errors, totalAmount, duplicates };
  }, [results, duplicateCount]);

  const chartData = useMemo(() => {
    return CATEGORIES.map(cat => ({
      name: cat.charAt(0).toUpperCase() + cat.slice(1),
      value: results.filter(r => r.category === cat).length,
      amount: results.filter(r => r.category === cat).reduce((sum, r) => sum + r.amount, 0),
      color: COLORS[cat],
    }));
  }, [results]);

  const handleProcessText = async () => {
    if (!emailInput.trim()) return;
    setIsProcessing(true);
    addLog("Starting batch processing...", "info");
    
    const emails = emailInput.split(/\n\s*\n/).filter(e => e.trim().length > 10).slice(0, settings.batchSize);
    addLog(`Found ${emails.length} potential emails.`, "info");

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      addLog(`Processing email ${i + 1}/${emails.length}...`, "info");
      
      const result = await extractFromEmail(email, customInstructions, settings.provider);
      if (selectedProjectId) result.projectId = selectedProjectId;
      processResult(result, `Email Batch ${i + 1}`);
    }

    setIsProcessing(false);
    setEmailInput("");
    addLog("Batch processing complete.", "success");
    if (settings.autoSpeak) handleSpeak();
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    addLog(`Uploading ${acceptedFiles.length} files...`, "info");

    for (const file of acceptedFiles) {
      addLog(`Analyzing file: ${file.name}`, "info");
      
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          const result = await analyzeInvoiceImage(base64, file.type, customInstructions, settings.provider);
          if (selectedProjectId) result.projectId = selectedProjectId;
          processResult(result, file.name);
        };
        reader.readAsDataURL(file);
      } else if (file.type === "text/plain") {
        const text = await file.text();
        const result = await extractFromEmail(text, customInstructions, settings.provider);
        if (selectedProjectId) result.projectId = selectedProjectId;
        processResult(result, file.name);
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        addLog(`Reading Excel file: ${file.name}`, "info");
        const rows = await readFromExcel(file);
        addLog(`Extracted ${rows.length} rows from Excel. Processing...`, "info");
        for (const row of rows) {
          const result = await extractFromEmail(row, customInstructions, settings.provider);
          if (selectedProjectId) result.projectId = selectedProjectId;
          processResult(result, `Excel Row: ${file.name}`);
        }
      } else {
        addLog(`Unsupported file type: ${file.type}`, "error");
      }
    }
    setIsProcessing(false);
  }, [addLog, processResult]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    }
  } as any);

  const handleSpeak = () => {
    const text = `Processing complete. Total items: ${stats.total}. Total amount: ${stats.totalAmount.toFixed(2)}. Success rate: ${((stats.success / stats.total) * 100 || 0).toFixed(0)} percent.`;
    speakSummary(text);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#141414] font-sans flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab("dashboard")}>
                <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
                <h1 className="font-serif italic text-xl font-bold tracking-tight">AI Ops Master</h1>
              </div>
              
              <nav className="hidden md:flex items-center gap-1">
                {[
                  { id: "projects", label: "Projects", icon: FolderKanban },
                  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
                  { id: "input", label: "Operations", icon: Mail },
                  { id: "history", label: "History", icon: History },
                  { id: "settings", label: "Settings", icon: Settings },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-mono text-[10px] uppercase tracking-wider",
                      activeTab === item.id 
                        ? "bg-[#141414] text-white" 
                        : "text-gray-500 hover:bg-gray-100 hover:text-[#141414]"
                    )}
                  >
                    <item.icon size={14} />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-4 mr-4 border-r border-gray-200 pr-4">
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full", isProcessing ? "bg-amber-500 animate-pulse" : "bg-green-500")} />
                  <span className="font-mono text-[9px] uppercase opacity-50">
                    {isProcessing ? "Processing" : "Ready"}
                  </span>
                </div>
                {selectedProjectId && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-mono text-[9px] uppercase font-bold border border-blue-100">
                    {projects.find(p => p.id === selectedProjectId)?.title}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSaveSession}
                  className="p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-all"
                  title="Save Session"
                >
                  <Save size={16} />
                </button>
                <button 
                  onClick={handleLoadSession}
                  className="p-2 text-gray-500 hover:bg-green-50 hover:text-green-600 rounded-lg transition-all"
                  title="Load Session"
                >
                  <Upload size={16} />
                </button>
                <button 
                  onClick={() => exportToExcel(results)}
                  disabled={results.length === 0}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-lg hover:bg-black transition-all text-[10px] font-mono uppercase disabled:opacity-30"
                >
                  <Download size={14} /> Export
                </button>
                <button 
                  onClick={() => { setResults([]); setLogs([]); }}
                  className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"
                  title="Clear All"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AnimatePresence mode="wait">
            {activeTab === "projects" && (
              <motion.div 
                key="projects"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <h2 className="font-serif italic text-2xl font-bold">Project Board</h2>
                  <button className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-lg font-mono text-xs uppercase tracking-wider hover:bg-black transition-all">
                    <Plus size={16} /> New Project
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                  {projects.map((project) => (
                    <motion.div 
                      key={project.id}
                      whileHover={{ y: -5 }}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setActiveTab("input");
                        addLog(`Switched to project: ${project.title}`, "info");
                      }}
                      className={cn(
                        "bg-white border border-[#141414] rounded-2xl overflow-hidden cursor-pointer transition-all group",
                        selectedProjectId === project.id ? "ring-2 ring-blue-500 shadow-lg" : "shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]"
                      )}
                    >
                      <div className="p-8 flex justify-center bg-gray-50 group-hover:bg-gray-100 transition-colors relative">
                        <div className="w-16 h-16 bg-[#141414] rounded-xl flex items-center justify-center text-white">
                          {project.icon === "book" && <FileText size={32} />}
                          {project.icon === "calendar" && <Clock size={32} />}
                          {project.icon === "laptop" && <LayoutDashboard size={32} />}
                          {project.icon === "plug" && <Settings size={32} />}
                          {project.icon === "pencil" && <ImageIcon size={32} />}
                          {project.icon === "image" && <ImageIcon size={32} />}
                          {project.icon === "cards" && <History size={32} />}
                          {project.icon === "globe" && <BarChart3 size={32} />}
                          {project.icon === "dollar" && <BarChart3 size={32} />}
                          {project.icon === "wallet" && <BarChart3 size={32} />}
                        </div>
                        <div className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-mono opacity-40">
                          <Star size={10} /> {project.starCount}
                        </div>
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-mono opacity-50">
                          <User size={12} /> created by {project.creator}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-mono opacity-40 uppercase">{project.createdAt}</p>
                          <h3 className="font-serif font-bold text-lg group-hover:text-blue-600 transition-colors">{project.title}</h3>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                          <div className="flex gap-2">
                            <div className="w-4 h-4 rounded border border-gray-200" />
                            <div className="w-4 h-4 rounded border border-gray-200" />
                          </div>
                          <div className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center">
                            <Play size={10} className="ml-0.5" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "dashboard" && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-serif italic font-bold">Dashboard</h2>
                    <p className="text-sm text-gray-500 font-mono uppercase mt-1">Real-time operations overview</p>
                  </div>
                  <button 
                    onClick={handleSpeak}
                    disabled={stats.total === 0}
                    className="flex items-center gap-2 px-6 py-2 border border-[#141414] rounded-full hover:bg-[#141414] hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed font-mono text-[10px] uppercase tracking-widest"
                  >
                    <Volume2 size={14} /> Speak Summary
                  </button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: "Processed", val: stats.total, icon: FileText, color: "blue" },
                    { label: "Success", val: stats.success, icon: CheckCircle2, color: "green" },
                    { label: "Warnings", val: stats.warnings, icon: AlertCircle, color: "orange" },
                    { label: "Total Value", val: `$${stats.totalAmount.toLocaleString()}`, icon: BarChart3, color: "purple" },
                  ].map((s, i) => (
                    <div key={i} className="bg-white border border-[#141414] p-6 rounded-xl shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                      <div className="flex justify-between items-start mb-4">
                        <s.icon size={20} className={`text-${s.color}-600`} />
                        <span className="font-mono text-[10px] uppercase opacity-50">{s.label}</span>
                      </div>
                      <div className="text-3xl font-serif font-bold italic">{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Charts & Logs */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white border border-[#141414] p-8 rounded-2xl">
                    <h2 className="font-serif italic text-lg mb-6 flex items-center gap-2">
                      <BarChart3 size={20} /> Category Distribution
                    </h2>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                          <Tooltip 
                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #141414', fontFamily: 'monospace', fontSize: '10px' }}
                          />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-[#141414] text-white p-6 rounded-2xl overflow-hidden flex flex-col h-full">
                    <h2 className="font-mono text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2 text-blue-400">
                      <Info size={14} /> System Logs
                    </h2>
                    <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-2 custom-scrollbar">
                      {logs.length === 0 && <p className="opacity-30 italic">Waiting for operations...</p>}
                      {logs.map((log, i) => (
                        <div key={i} className="flex gap-2 border-b border-white/10 pb-2">
                          <span className="opacity-40">[{log.time}]</span>
                          <span className={cn(
                            log.type === "success" && "text-green-400",
                            log.type === "error" && "text-red-400",
                            log.type === "warning" && "text-orange-400",
                            log.type === "info" && "text-blue-400"
                          )}>
                            {log.msg}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "input" && (
              <motion.div 
                key="input"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="bg-white border border-[#141414] p-8 rounded-2xl space-y-6">
                  <h2 className="font-serif italic text-lg flex items-center gap-2">
                    <Mail size={20} /> Email Batch Input
                  </h2>

                  <div className="flex gap-4">
                    {!isAuthenticated ? (
                      <button 
                        onClick={handleConnectGmail}
                        className="flex-1 py-3 border border-[#141414] rounded-xl font-mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-600 transition-all"
                      >
                        <Mail size={14} /> Connect Gmail
                      </button>
                    ) : (
                      <button 
                        onClick={handleFetchGmailInvoices}
                        disabled={isProcessing}
                        className="flex-1 py-3 border border-[#141414] rounded-xl font-mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-green-50 hover:text-green-600 transition-all disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                        Scan Gmail for Invoices
                      </button>
                    )}
                  </div>

                  <textarea 
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Paste raw email text here... (Separate multiple emails with double newlines)"
                    className="w-full h-64 p-4 bg-[#f9f9f9] border border-[#141414] rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />

                  {/* Advanced Section */}
                  <div className="border-t border-[#141414] pt-6 mt-6">
                    <details className="group">
                      <summary className="font-mono text-[10px] uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2">
                        <Settings size={12} className="group-open:rotate-90 transition-transform" /> 
                        Advanced: Custom AI Instructions
                      </summary>
                      <div className="mt-4 space-y-2">
                        <p className="text-[9px] font-mono opacity-50 uppercase">Add specific rules for the AI (e.g., "Ignore amounts under $10", "Mark all vendors as 'Internal'")</p>
                        <textarea 
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          placeholder="Enter custom AI instructions..."
                          className="w-full h-24 p-3 bg-[#f9f9f9] border border-[#141414] rounded-lg font-mono text-[10px] focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        />
                      </div>
                    </details>
                  </div>

                  <button 
                    onClick={handleProcessText}
                    disabled={isProcessing || !emailInput.trim()}
                    className="w-full py-4 bg-[#141414] text-white rounded-xl font-mono uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-black transition-all disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Play size={18} />}
                    Process Batch (Ctrl+Enter)
                  </button>
                </div>

                <div 
                  {...getRootProps()} 
                  className={cn(
                    "border-2 border-dashed border-[#141414] p-12 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all cursor-pointer",
                    isDragActive ? "bg-blue-50 border-blue-500" : "bg-white/50 hover:bg-white"
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="p-4 bg-white border border-[#141414] rounded-full shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                    <Upload size={24} />
                  </div>
                  <div className="text-center">
                    <p className="font-serif italic font-bold">Drop files here</p>
                    <p className="text-[10px] font-mono uppercase opacity-50 mt-1">Supports .txt, .png, .jpg (Invoices)</p>
                  </div>
                </div>

                <div className="bg-white border border-[#141414] rounded-2xl overflow-hidden flex flex-col h-[500px]">
                  <div className="p-6 border-b border-[#141414] bg-black/5 flex justify-between items-center">
                    <h2 className="font-serif italic text-lg">Live Preview</h2>
                    <span className="font-mono text-[10px] uppercase px-2 py-1 bg-white border border-[#141414] rounded-full">
                      {results.length} Items Found
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {results.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 p-12 text-center">
                        <FileText size={48} strokeWidth={1} />
                        <p className="mt-4 font-serif italic">No data extracted yet.<br/>Start by pasting emails or uploading files.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#141414]">
                        {results.map((res, i) => (
                          <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={i} 
                            className="p-4 hover:bg-black/5 transition-all group"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                {res.status === "success" ? <CheckCircle2 size={14} className="text-green-600" /> : <AlertCircle size={14} className="text-orange-600" />}
                                <span className="font-bold text-sm">{res.name}</span>
                              </div>
                              <span className="font-mono text-[10px] font-bold">${res.amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex gap-2">
                                <span className={cn(
                                  "text-[8px] uppercase font-mono px-1.5 py-0.5 rounded border border-[#141414]",
                                  `bg-[${COLORS[res.category]}]/10`
                                )}>
                                  {res.category}
                                </span>
                                <span className="text-[8px] uppercase font-mono px-1.5 py-0.5 rounded border border-[#141414] bg-white">
                                  {res.date}
                                </span>
                              </div>
                              <span className="text-[8px] font-mono opacity-40 group-hover:opacity-100 transition-opacity">
                                {res.email_id}
                              </span>
                            </div>
                            {res.validation_errors.length > 0 && (
                              <div className="mt-2 p-2 bg-red-50 rounded border border-red-200 text-[9px] text-red-600 font-mono">
                                {res.validation_errors.map((err, ei) => (
                                  <div key={ei} className="flex items-center gap-1">
                                    <XCircle size={8} /> {err}
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div 
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white border border-[#141414] rounded-2xl overflow-hidden"
              >
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-black/5 border-b border-[#141414] font-mono text-[10px] uppercase tracking-widest">
                      <th className="p-4 italic font-serif normal-case text-xs">ID</th>
                      <th className="p-4">Entity Name</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Source</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414] font-mono text-xs">
                    {results.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-12 text-center opacity-30 italic font-serif">No history available.</td>
                      </tr>
                    )}
                    {results.map((res, i) => (
                      <React.Fragment key={i}>
                        <tr className="hover:bg-black/5 transition-all">
                          <td className="p-4 opacity-50">{res.email_id}</td>
                          <td className="p-4 font-bold">{res.name}</td>
                          <td className="p-4">{res.date}</td>
                          <td className="p-4 font-bold">${res.amount.toFixed(2)}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-full border border-[#141414] text-[9px] uppercase" style={{ backgroundColor: `${COLORS[res.category]}20` }}>
                              {res.category}
                            </span>
                          </td>
                          <td className="p-4 flex items-center gap-1.5 opacity-60">
                            {res.source_type === "image" ? <ImageIcon size={12} /> : <FileText size={12} />}
                            {res.source_type}
                          </td>
                          <td className="p-4">
                            {res.status === "success" ? (
                              <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> OK</span>
                            ) : (
                              <span className="text-orange-600 flex items-center gap-1"><AlertCircle size={12} /> WARN</span>
                            )}
                          </td>
                        </tr>
                        {(res.validation_errors.length > 0 || res.fallback_reason) && (
                          <tr className="bg-red-50/30">
                            <td colSpan={7} className="p-4 pt-0">
                              <div className="flex flex-col gap-1 font-mono text-[9px]">
                                {res.fallback_reason && (
                                  <div className="text-blue-600 flex items-center gap-1">
                                    <Info size={10} /> Fallback: {res.fallback_reason}
                                  </div>
                                )}
                                {res.validation_errors.map((err, ei) => (
                                  <div key={ei} className="text-red-500 flex items-center gap-1">
                                    <XCircle size={10} /> Error: {err}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="bg-white border border-[#141414] p-8 rounded-2xl space-y-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
                  <h2 className="font-serif italic text-2xl border-b border-[#141414] pb-4">System Configuration</h2>
                  
                  <div className="space-y-6">
                    {/* OAuth Troubleshooting */}
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                      <h3 className="font-bold text-sm text-amber-800 flex items-center gap-2">
                        <AlertCircle size={16} /> Google OAuth Troubleshooting
                      </h3>
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        If you see <b>Error 401: deleted_client</b>, your Google Client ID is invalid or has been deleted in the Google Cloud Console.
                      </p>
                      <ol className="text-[9px] text-amber-700 list-decimal list-inside space-y-1 opacity-80">
                        <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="underline">Google Cloud Console</a>.</li>
                        <li>Create a new <b>OAuth 2.0 Client ID</b> (Web Application).</li>
                        <li>Add <code>{window.location.origin}</code> to <b>Authorized JavaScript Origins</b>.</li>
                        <li>Add <code>{window.location.origin}/auth/google/callback</code> to <b>Authorized Redirect URIs</b>.</li>
                        <li>Update <b>GOOGLE_CLIENT_ID</b> and <b>GOOGLE_CLIENT_SECRET</b> in AI Studio Settings.</li>
                      </ol>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">Batch Processing Limit</p>
                        <p className="text-[10px] opacity-50 font-mono">Maximum emails to process in one go</p>
                      </div>
                      <input 
                        type="number" 
                        value={settings.batchSize}
                        onChange={(e) => setSettings(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                        className="w-20 p-2 border border-[#141414] rounded font-mono text-xs text-center"
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">Auto-Speak Summary</p>
                        <p className="text-[10px] opacity-50 font-mono">Automatically read summary after processing</p>
                      </div>
                      <button 
                        onClick={() => setSettings(prev => ({ ...prev, autoSpeak: !prev.autoSpeak }))}
                        className={cn(
                          "w-12 h-6 rounded-full border border-[#141414] relative transition-all",
                          settings.autoSpeak ? "bg-green-500" : "bg-gray-200"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 bg-white border border-[#141414] rounded-full absolute top-0.5 transition-all",
                          settings.autoSpeak ? "left-6" : "left-1"
                        )} />
                      </button>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">Duplicate Detection</p>
                        <p className="text-[10px] opacity-50 font-mono">Skip entries with identical email IDs</p>
                      </div>
                      <button 
                        onClick={() => setSettings(prev => ({ ...prev, duplicateDetection: !prev.duplicateDetection }))}
                        className={cn(
                          "w-12 h-6 rounded-full border border-[#141414] relative transition-all",
                          settings.duplicateDetection ? "bg-green-500" : "bg-gray-200"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 bg-white border border-[#141414] rounded-full absolute top-0.5 transition-all",
                          settings.duplicateDetection ? "left-6" : "left-1"
                        )} />
                      </button>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">AI Model Provider</p>
                        <p className="text-[10px] opacity-50 font-mono">Select the AI engine to use</p>
                      </div>
                      <select 
                        value={settings.provider}
                        onChange={(e) => setSettings(prev => ({ ...prev, provider: e.target.value as ModelProvider }))}
                        className="p-2 border border-[#141414] rounded font-mono text-xs bg-white"
                      >
                        <option value="gemini">Gemini 3 Flash</option>
                        <option value="ollama">Ollama (Local)</option>
                        <option value="claude">Claude 3.5 Sonnet</option>
                      </select>
                    </div>

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">AI Model Engine</p>
                        <p className="text-[10px] opacity-50 font-mono">Current processing engine (Read-only)</p>
                      </div>
                      <span className="font-mono text-[10px] uppercase font-bold text-blue-600">Gemini-3-Flash</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#141414] text-white p-8 rounded-2xl space-y-4">
                  <h3 className="font-serif italic text-lg text-blue-400">Security & Privacy</h3>
                  <ul className="space-y-2 font-mono text-[10px] uppercase opacity-70 list-disc list-inside">
                    <li>All data is processed in-memory and not stored permanently.</li>
                    <li>External API calls are encrypted via HTTPS.</li>
                    <li>Grounding data is used for verification only.</li>
                    <li>No PII is logged to the system console.</li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Global Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #141414;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

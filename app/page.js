"use client";

import { useEffect, useState, useMemo, memo, useRef } from "react";
import {
  Plus,
  Trash2,
  Wallet,
  TrendingDown,
  TrendingUp,
  Landmark,
  ArrowDownLeft,
  HandCoins,
  Undo2,
  Search,
  Download,
  PiggyBank,
  CheckCircle2,
  Activity,
  LayoutDashboard,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const STORAGE_KEY = "expense-tracker:v2";
const LEGACY_KEY = "expense-tracker:v1";

// Transaction types. Each one affects the money math differently.
// Palette stays in a cohesive cool family: blue/indigo brand + restrained
// emerald (money in) and rose (money out) for at-a-glance semantics.
const TYPES = [
  { id: "income", label: "Income", color: "#0d9488", sign: +1 },
  { id: "expense", label: "Expense", color: "#e11d57", sign: -1 },
  { id: "save", label: "Save", color: "#2563eb", sign: -1 },
  { id: "withdraw", label: "Withdraw", color: "#6366f1", sign: +1 },
  { id: "lend", label: "Lent Out", color: "#7c3aed", sign: -1 },
  { id: "repay", label: "Repaid", color: "#0891b2", sign: +1 },
];
const getType = (id) => TYPES.find((t) => t.id === id) || TYPES[1];

// Sidebar / filter navigation. "bank" and "people" are groups of two types.
const NAV = [
  { id: "all", label: "Dashboard", icon: LayoutDashboard },
  { id: "income", label: "Income", icon: TrendingUp },
  { id: "expense", label: "Expenses", icon: TrendingDown },
  { id: "bank", label: "Bank", icon: Landmark },
  { id: "people", label: "Lending", icon: HandCoins },
];

const matchesFilter = (t, filter) => {
  if (filter === "all") return true;
  if (filter === "bank") return t.type === "save" || t.type === "withdraw";
  if (filter === "people") return t.type === "lend" || t.type === "repay";
  return t.type === filter;
};

// Cool tonal scale (blues → indigos → teals → slate) so the pie reads as one
// designed gradient rather than a rainbow.
const EXPENSE_CATEGORIES = [
  { id: "food", label: "Food", color: "#2563eb" },
  { id: "transport", label: "Transport", color: "#0ea5e9" },
  { id: "shopping", label: "Shopping", color: "#6366f1" },
  { id: "bills", label: "Bills", color: "#8b5cf6" },
  { id: "entertainment", label: "Entertainment", color: "#0891b2" },
  { id: "health", label: "Health", color: "#14b8a6" },
  { id: "education", label: "Education", color: "#3b82f6" },
  { id: "other", label: "Other", color: "#94a3b8" },
];

const INCOME_SOURCES = [
  { id: "daily", label: "Daily", color: "#0d9488" },
  { id: "salary", label: "Salary", color: "#0ea5e9" },
  { id: "business", label: "Business", color: "#6366f1" },
  { id: "gift", label: "Gift", color: "#14b8a6" },
  { id: "other_income", label: "Other", color: "#94a3b8" },
];

const getCategory = (id) =>
  EXPENSE_CATEGORIES.find((c) => c.id === id) ||
  INCOME_SOURCES.find((c) => c.id === id) ||
  EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

const todayISO = () => new Date().toISOString().slice(0, 10);

const formatCurrency = (n, currency = "USD") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);

// Measures a container's width with a guarded ResizeObserver. We render charts
// at an explicit pixel width instead of Recharts' ResponsiveContainer, which
// can enter an infinite resize loop (and freeze the tab) inside flex/grid
// parents. The `prev === w ? prev : w` guard makes feedback loops impossible.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export default function Home() {
  const [transactions, setTransactions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [currency, setCurrency] = useState("USD");

  // form state
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());

  // filter state
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  // toast / flash message
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // Load from localStorage (with one-time migration from the v1 expenses-only format)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setTransactions(parsed.transactions || []);
        setCurrency(parsed.currency || "USD");
      } else {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          const migrated = (parsed.expenses || []).map((e) => ({
            ...e,
            type: "expense",
          }));
          setTransactions(migrated);
          setCurrency(parsed.currency || "USD");
        }
      }
    } catch (e) {
      console.error("Failed to load transactions", e);
    }
    setLoaded(true);
  }, []);

  // Persist whenever transactions or currency change
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ transactions, currency })
    );
  }, [transactions, currency, loaded]);

  // When switching type, default the category to a sensible value for that type
  const selectType = (id) => {
    setType(id);
    if (id === "expense") setCategory("food");
    else if (id === "income") setCategory("daily");
    else setCategory(id); // save / withdraw don't use a category picker
  };

  const addTransaction = (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!value || value <= 0) return;
    const usesCategory = type === "expense" || type === "income";
    const fallback = usesCategory
      ? getCategory(category).label
      : getType(type).label;
    const newTx = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type,
      amount: value,
      category: usesCategory ? category : type,
      description: description.trim() || fallback,
      date,
      createdAt: Date.now(),
    };
    setTransactions((prev) => [newTx, ...prev]);
    setToast({
      key: Date.now(),
      msg: `${getType(type).label} of ${formatCurrency(value, currency)} added`,
      color: getType(type).color,
    });
    setAmount("");
    setDescription("");
    setDate(todayISO());
  };

  const deleteTransaction = (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setToast({ key: Date.now(), msg: "Transaction deleted", color: "#64748b" });
  };

  const exportCSV = () => {
    const header = "Date,Type,Category,Description,Amount\n";
    const rows = transactions
      .map((t) => {
        const usesCat = t.type === "expense" || t.type === "income";
        const catLabel = usesCat ? getCategory(t.category).label : "";
        return `${t.date},${getType(t.type).label},${catLabel},"${t.description.replace(
          /"/g,
          '""'
        )}",${t.amount}`;
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Derived money math (all automatic) ----
  const totals = useMemo(() => {
    let income = 0,
      expense = 0,
      saved = 0,
      withdrawn = 0,
      lent = 0,
      repaid = 0;
    for (const t of transactions) {
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") expense += t.amount;
      else if (t.type === "save") saved += t.amount;
      else if (t.type === "withdraw") withdrawn += t.amount;
      else if (t.type === "lend") lent += t.amount;
      else if (t.type === "repay") repaid += t.amount;
    }
    const bank = saved - withdrawn; // money currently stored in the bank
    const owed = lent - repaid; // money others still owe you (a receivable)
    const inHand = income - expense - bank - owed; // cash available right now
    const netWorth = inHand + bank + owed; // = income - expense (lending isn't a loss)
    // Total money that has flowed through, all time (gross volume of every entry)
    const lifetimeFlow = income + expense + saved + withdrawn + lent + repaid;
    return { income, expense, bank, owed, inHand, netWorth, lifetimeFlow };
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (!matchesFilter(t, filterType)) return false;
      if (
        search &&
        !t.description.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [transactions, filterType, search]);

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  // Spending by category, this month (expenses only)
  const byCategory = useMemo(() => {
    const map = {};
    transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(thisMonthKey))
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return EXPENSE_CATEGORIES.map((c) => ({
      name: c.label,
      value: map[c.id] || 0,
      color: c.color,
    })).filter((d) => d.value > 0);
  }, [transactions, thisMonthKey]);

  // Income vs Expense, last 6 months
  const last6Months = useMemo(() => {
    const base = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      const label = d.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
      let income = 0,
        expense = 0;
      for (const t of transactions) {
        if (!t.date.startsWith(key)) continue;
        if (t.type === "income") income += t.amount;
        else if (t.type === "expense") expense += t.amount;
      }
      months.push({
        month: label,
        income: parseFloat(income.toFixed(2)),
        expense: parseFloat(expense.toFixed(2)),
      });
    }
    return months;
  }, [transactions]);

  const usesCategory = type === "expense" || type === "income";
  const categoryOptions =
    type === "income" ? INCOME_SOURCES : EXPENSE_CATEGORIES;

  return (
    <div className="flex min-h-screen">
      <Sidebar active={filterType} onSelect={setFilterType} />
      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px]">
        <MobileNav active={filterType} onSelect={setFilterType} />
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tight leading-none">
              Dashboard
            </h1>
            <p className="text-[13px] text-slate-400 mt-1">
              Your money at a glance
            </p>
          </div>
          <div className="flex items-center gap-2">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="text-sm font-medium text-slate-600 border border-slate-200/70 rounded-xl px-3 py-2 bg-white shadow-sm hover:bg-slate-50 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
            <option value="GBP">GBP £</option>
            <option value="INR">INR ₹</option>
            <option value="BDT">BDT ৳</option>
            <option value="JPY">JPY ¥</option>
            <option value="CAD">CAD $</option>
            <option value="AUD">AUD $</option>
          </select>
          <button
            onClick={exportCSV}
            disabled={transactions.length === 0}
            className="text-sm font-medium flex items-center gap-1.5 text-white rounded-xl px-4 py-2 bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Money In"
          value={formatCurrency(totals.income, currency)}
          icon={<TrendingUp size={16} />}
          accent="bg-teal-50 text-teal-600"
        />
        <StatCard
          label="Spent"
          value={formatCurrency(totals.expense, currency)}
          icon={<TrendingDown size={16} />}
          accent="bg-rose-50 text-rose-600"
        />
        <StatCard
          label="In Bank"
          value={formatCurrency(totals.bank, currency)}
          icon={<Landmark size={16} />}
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Owed to Me"
          value={formatCurrency(totals.owed, currency)}
          icon={<HandCoins size={16} />}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Total Flow · lifetime"
          value={formatCurrency(totals.lifetimeFlow, currency)}
          icon={<Activity size={16} />}
          accent="bg-amber-50 text-amber-600"
        />
        <HeroStatCard
          label="In Hand"
          value={formatCurrency(totals.inHand, currency)}
          sub={`Net worth ${formatCurrency(totals.netWorth, currency)}`}
        />
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="card p-6 lg:col-span-2 min-w-0">
          <h2 className="text-[15px] font-semibold">Monthly Trend</h2>
          <p className="text-xs text-slate-400 mb-4">
            Income vs expenses, last 6 months
          </p>
          <MonthlyTrend data={last6Months} currency={currency} />
        </div>
        <div className="card p-6 min-w-0">
          <h2 className="text-[15px] font-semibold">Top Categories</h2>
          <p className="text-xs text-slate-400 mb-2">Spending this month</p>
          {byCategory.length > 0 ? (
            <TopCategories data={byCategory} currency={currency} />
          ) : (
            <div className="h-44 flex items-center justify-center text-center text-sm text-slate-400">
              No spending recorded this month yet.
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Add transaction form */}
        <section className="lg:col-span-2">
          <div className="card p-6">
            <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Plus size={15} />
              </span>
              Add Transaction
            </h2>

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-1.5 mb-5 p-1 bg-slate-50 rounded-2xl border border-slate-100">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectType(t.id)}
                  className={`text-xs font-medium py-2 rounded-xl transition-all leading-tight ${
                    type === t.id
                      ? "text-white shadow-md"
                      : "bg-transparent hover:bg-white text-slate-500"
                  }`}
                  style={
                    type === t.id
                      ? {
                          background: `linear-gradient(135deg, ${t.color}, ${t.color}dd)`,
                          boxShadow: `0 6px 16px -6px ${t.color}99`,
                        }
                      : undefined
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={addTransaction} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500">
                  Amount
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                    {formatCurrency(0, currency).replace(/[\d.,\s]/g, "")}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="tnum w-full pl-8 pr-3 py-2.5 text-lg font-semibold bg-slate-50 border border-slate-200/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white focus:border-blue-300 transition"
                  />
                </div>
              </div>

              {usesCategory && (
                <div>
                  <label className="text-xs font-medium text-slate-500">
                    {type === "income" ? "Source" : "Category"}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                    {categoryOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategory(c.id)}
                        className={`text-xs font-medium py-2 rounded-xl border transition-all ${
                          category === c.id
                            ? "border-transparent text-white shadow-md shadow-blue-500/20 bg-gradient-to-br from-slate-800 to-slate-900"
                            : "border-slate-200/70 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-600"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!usesCategory && (
                <div className="text-xs text-blue-700/80 bg-blue-50/60 border border-blue-100 rounded-xl px-3.5 py-3 flex items-center gap-2.5">
                  <PiggyBank size={16} className="text-blue-500 shrink-0" />
                  {type === "save"
                    ? "Moves money from In Hand into your Bank."
                    : type === "withdraw"
                    ? "Takes money from your Bank back into In Hand."
                    : type === "lend"
                    ? "Money you lent out. Stays in Net Worth as “Owed to Me”."
                    : "Someone paid you back. Moves it back into In Hand."}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-500">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === "income"
                      ? "Daily wage, freelance, etc."
                      : type === "expense"
                      ? "Coffee, groceries, etc."
                      : type === "lend" || type === "repay"
                      ? "Who borrowed it, reason, etc."
                      : "Bank name, reason, etc."
                  }
                  className="w-full mt-1.5 bg-slate-50 border border-slate-200/70 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white focus:border-blue-300 transition"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full mt-1.5 bg-slate-50 border border-slate-200/70 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white focus:border-blue-300 transition"
                />
              </div>

              <button
                type="submit"
                className="w-full text-white rounded-xl py-3 font-semibold transition-all hover:-translate-y-0.5 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${getType(type).color}, ${
                    getType(type).color
                  }cc)`,
                  boxShadow: `0 10px 24px -10px ${getType(type).color}`,
                }}
              >
                Add {getType(type).label}
              </button>
            </form>
          </div>
        </section>

        {/* Right column */}
        <section className="lg:col-span-3">
          <div className="card p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h2 className="font-semibold text-[15px]">
                History{" "}
                <span className="text-slate-400 font-normal text-sm">
                  ({filtered.length})
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="text-sm bg-slate-50 border border-slate-200/70 rounded-xl pl-8 pr-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white transition"
                  />
                </div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="text-sm bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                >
                  {NAV.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id === "all" ? "All types" : n.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                {transactions.length === 0
                  ? "No transactions yet. Add your first one!"
                  : "Nothing matches your filter."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((t) => {
                  const ty = getType(t.type);
                  const cat = getCategory(t.category);
                  const usesCat = t.type === "expense" || t.type === "income";
                  const badgeColor = usesCat ? cat.color : ty.color;
                  const sub = usesCat ? `${ty.label} · ${cat.label}` : ty.label;
                  return (
                    <li
                      key={t.id}
                      className="py-3 flex items-center gap-3 group"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm"
                        style={{
                          background: `linear-gradient(135deg, ${badgeColor}, ${badgeColor}cc)`,
                        }}
                      >
                        <TxIcon type={t.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {t.description}
                        </div>
                        <div className="text-xs text-slate-400">
                          {sub} ·{" "}
                          {new Date(t.date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <div
                        className="tnum font-semibold text-sm whitespace-nowrap"
                        style={{ color: ty.color }}
                      >
                        {ty.sign > 0 ? "+" : "−"}
                        {formatCurrency(t.amount, currency).replace(/^-/, "")}
                      </div>
                      <button
                        onClick={() => deleteTransaction(t.id)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                        aria-label="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <footer className="text-center text-xs text-slate-400 mt-8 pb-4">
        All data is stored locally in your browser. Clearing site data will
        delete it.
      </footer>

      {/* Flash / toast */}
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-5 right-5 z-50 toast-in"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2.5 bg-slate-900 text-white text-sm font-medium pl-3 pr-4 py-3 rounded-2xl shadow-xl shadow-slate-900/20">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: toast.color }}
            >
              <CheckCircle2 size={15} />
            </span>
            {toast.msg}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Sidebar({ active, onSelect }) {
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-0 h-screen border-r border-slate-200/70 bg-white/60 px-4 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-9">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
          <Wallet size={18} />
        </div>
        <span className="font-bold text-lg tracking-tight">Money</span>
      </div>
      <nav className="space-y-1">
        {NAV.map((n) => {
          const Icon = n.icon;
          const on = active === n.id;
          return (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                on
                  ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-500/25"
                  : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-800"
              }`}
            >
              <Icon size={18} />
              {n.label}
            </button>
          );
        })}
      </nav>
      <p className="mt-auto px-3 text-[11px] leading-relaxed text-slate-400">
        Everything is saved locally in your browser.
      </p>
    </aside>
  );
}

function MobileNav({ active, onSelect }) {
  return (
    <div className="lg:hidden -mx-4 px-4 mb-5 flex gap-2 overflow-x-auto pb-1">
      {NAV.map((n) => {
        const Icon = n.icon;
        const on = active === n.id;
        return (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
              on
                ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-blue-500/25"
                : "bg-white text-slate-500 border border-slate-200/70"
            }`}
          >
            <Icon size={14} />
            {n.label}
          </button>
        );
      })}
    </div>
  );
}

// Charts are memoized so high-frequency parent re-renders (typing in the
// search/amount fields) don't re-render the expensive Recharts subtree.
// Animations are disabled to avoid continuous requestAnimationFrame loops.
const MonthlyTrend = memo(function MonthlyTrend({ data, currency }) {
  const [ref, w] = useWidth();
  const compact = (v) =>
    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`;
  return (
    <div ref={ref} className="h-64 w-full">
      {w > 0 && (
        <BarChart
          width={w}
          height={256}
          data={data}
          barGap={6}
          barCategoryGap="24%"
          margin={{ top: 8, right: 4, left: -12, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
            <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d57" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#eef2f7" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            dy={8}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid #eef2f7",
              boxShadow: "0 12px 30px -12px rgba(15,23,42,0.25)",
              fontSize: 13,
              padding: "10px 12px",
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            formatter={(v, n) => [formatCurrency(v, currency), n]}
          />
          <Legend
            iconType="circle"
            iconSize={9}
            wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
          />
          <Bar
            dataKey="income"
            name="income"
            fill="url(#gIncome)"
            radius={[10, 10, 10, 10]}
            maxBarSize={18}
            isAnimationActive={false}
            background={{ fill: "#f1f5f9", radius: 10 }}
          />
          <Bar
            dataKey="expense"
            name="expense"
            fill="url(#gExpense)"
            radius={[10, 10, 10, 10]}
            maxBarSize={18}
            isAnimationActive={false}
            background={{ fill: "#f1f5f9", radius: 10 }}
          />
        </BarChart>
      )}
    </div>
  );
});

const TopCategories = memo(function TopCategories({ data, currency }) {
  const [ref, w] = useWidth();
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      <div ref={ref} className="relative h-44 w-full">
        {w > 0 && (
          <PieChart width={w} height={176}>
            <Pie
              data={sorted}
              dataKey="value"
              nameKey="name"
              cx={w / 2}
              cy={88}
              innerRadius={56}
              outerRadius={80}
              paddingAngle={3}
              cornerRadius={6}
              stroke="none"
              isAnimationActive={false}
            >
              {sorted.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatCurrency(v, currency)}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #eef2f7",
                fontSize: 13,
              }}
            />
          </PieChart>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] text-slate-400">Total</span>
          <span className="tnum text-lg font-bold tracking-tight">
            {formatCurrency(total, currency)}
          </span>
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {sorted.map((d) => (
          <li
            key={d.name}
            className="flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2 text-slate-600">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: d.color }}
              />
              {d.name}
            </span>
            <span className="tnum font-semibold">
              {formatCurrency(d.value, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});

function TxIcon({ type }) {
  if (type === "income") return <TrendingUp size={16} />;
  if (type === "expense") return <TrendingDown size={16} />;
  if (type === "save") return <Landmark size={16} />;
  if (type === "withdraw") return <ArrowDownLeft size={16} />;
  if (type === "lend") return <HandCoins size={16} />;
  if (type === "repay") return <Undo2 size={16} />;
  return <Wallet size={16} />;
}

function StatCard({ label, value, icon, accent }) {
  return (
    <div className="card p-5 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span
          className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent}`}
        >
          {icon}
        </span>
      </div>
      <div className="tnum text-[22px] font-bold tracking-tight">{value}</div>
    </div>
  );
}

function HeroStatCard({ label, value, sub }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-5 text-white bg-gradient-to-br from-sky-500 via-blue-600 to-blue-700 shadow-xl shadow-blue-500/30">
      {/* Soft highlight using a cheap radial gradient (no blur filter = no GPU churn) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(120px 120px at 90% 0%, rgba(255,255,255,0.22), transparent 70%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-blue-100">{label}</span>
          <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
            <Wallet size={16} />
          </span>
        </div>
        <div className="tnum text-[22px] font-bold tracking-tight">{value}</div>
        {sub && (
          <div className="tnum text-[11px] mt-1 text-blue-100">{sub}</div>
        )}
      </div>
    </div>
  );
}

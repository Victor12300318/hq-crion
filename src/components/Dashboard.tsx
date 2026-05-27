"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Phone, CheckCircle, XCircle, Activity, Users, Award, CornerUpRight, Clock, Search, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import CallDetailsModal from "./CallDetailsModal";
import type { DashboardCall } from "./CallDetailsModal";
import DashboardUserMenu from "@/components/DashboardUserMenu";
import type { AuthUser } from "@/lib/auth";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface DashboardKpis {
  totalCalls: number;
  qaAverage: string;
  transferRate: string;
  transferCount: number;
  resolvedRate: string;
  resolvedCount: number;
  tma: string;
}

interface ChartItem {
  name: string;
  value: number;
}

interface DashboardData {
  agentsList: string[];
  kpis: DashboardKpis;
  charts: {
    reasons: ChartItem[];
    performance: ChartItem[];
  };
  latestCalls: DashboardCall[];
  error?: string;
}

type SortKey = keyof Pick<DashboardCall, "start_time" | "user_phone" | "agent_name" | "motivo_contato" | "nota_qa" | "transferido" | "status">;

interface DashboardProps {
  user: AuthUser;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value: number;
    payload?: {
      name?: string;
    };
  }>;
}

interface CustomPieTooltipProps extends CustomTooltipProps {
  total?: number;
}

const CustomPieTooltip = ({ active, payload, total }: CustomPieTooltipProps) => {
  if (active && payload && payload.length) {
    const name = payload[0].payload?.name || payload[0].name || "Não identificado";
    const value = payload[0].value;
    const totalVal = total || 1;
    const percentage = ((value / totalVal) * 100).toFixed(0);

    return (
      <div className="bg-slate-900/90 text-slate-50 dark:bg-slate-800/95 dark:text-slate-100 px-3 py-2.5 rounded-xl text-xs font-medium shadow-lg border border-slate-700/50 backdrop-blur-sm select-none flex flex-col gap-1.5 min-w-[170px]">
        <div className="font-semibold text-slate-200 border-b border-slate-700/50 pb-1 mb-1 truncate max-w-[180px]" title={name}>
          {name}
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Quantidade:</span>
          <span className="font-bold font-mono text-slate-200">{value}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Porcentagem:</span>
          <span className="bg-blue-500/20 text-blue-300 text-[10px] font-extrabold px-1.5 py-0.5 rounded font-mono">
            {percentage}%
          </span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const name = payload[0].payload?.name || payload[0].name || "Critério";
    const percentage = Number(payload[0].value);
    const formattedPercentage = isNaN(percentage) ? "0.0" : percentage.toFixed(1);

    return (
      <div className="bg-slate-900/90 text-slate-50 dark:bg-slate-800/95 dark:text-slate-100 px-3 py-2.5 rounded-xl text-xs font-medium shadow-lg border border-slate-700/50 backdrop-blur-sm select-none flex flex-col gap-1.5 min-w-[170px]">
        <div className="font-semibold text-slate-200 border-b border-slate-700/50 pb-1 mb-1 truncate max-w-[180px]" title={name}>
          {name}
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Desempenho:</span>
          <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-1.5 py-0.5 rounded font-mono">
            {formattedPercentage}%
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function Dashboard({ user }: DashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCallSid, setSelectedCallSid] = useState<string | null>(null);
  const [dateMode, setDateMode] = useState<"all" | "single" | "range">("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [isOpenAgentsDropdown, setIsOpenAgentsDropdown] = useState(false);
  const [filterReason, setFilterReason] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (dateMode === "single" && startDate) {
          queryParams.append("startDate", startDate);
        } else if (dateMode === "range" && startDate) {
          queryParams.append("startDate", startDate);
          if (endDate) {
            queryParams.append("endDate", endDate);
          }
        }
        if (selectedAgents.length > 0) {
          queryParams.append("agent", selectedAgents.join(","));
        }
        
        const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
        const res = await fetch(`/api/dashboard${query}`);

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        const json = (await res.json()) as DashboardData;
        setData(json);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateMode, startDate, endDate, selectedAgents, router]);

  useEffect(() => {
    if (!isOpenAgentsDropdown) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("#agents-dropdown-button") && !target.closest("[role='none']")) {
        setIsOpenAgentsDropdown(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [isOpenAgentsDropdown]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-background p-8 text-foreground">
        <div className="max-w-7xl mx-auto space-y-8">
          <Skeleton className="h-10 w-1/3 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-[300px] w-full rounded-xl" />
            <Skeleton className="h-[300px] w-full rounded-xl" />
          </div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-background space-y-4 p-8 text-center">
        <p className="text-xl font-semibold text-red-600">Erro ao carregar dados do Dashboard.</p>
        <p className="text-sm text-muted-foreground">
          Detalhes do erro: {data?.error || "Desconhecido"}. <br/>
          Verifique se o banco de dados PostgreSQL está rodando e acessível na porta configurada.
        </p>
      </div>
    );
  }

  const { kpis, charts, latestCalls } = data;

  const filteredCalls = latestCalls?.filter((call) => {
    if (filterReason && call.motivo_contato !== filterReason) return false;
    
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (call.user_phone && call.user_phone.toLowerCase().includes(term)) ||
      (call.motivo_contato && call.motivo_contato.toLowerCase().includes(term)) ||
      (call.nome && call.nome.toLowerCase().includes(term)) ||
      (call.cpf && call.cpf.toLowerCase().includes(term)) ||
      (call.agent_name && call.agent_name.toLowerCase().includes(term))
    );
  }) || [];

  const sortedCalls = [...filteredCalls].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let aVal = a[key];
    let bVal = b[key];

    if (aVal === null || aVal === undefined) aVal = "";
    if (bVal === null || bVal === undefined) bVal = "";

    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });

  const itemsPerPage = 50;
  const totalItems = sortedCalls.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const activePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (activePage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCalls = sortedCalls.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      const start = Math.max(2, activePage - 1);
      const end = Math.min(totalPages - 1, activePage + 1);

      if (start > 2) {
        pages.push("...");
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push("...");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const requestSort = (key: SortKey) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Painel Analítico de Qualidade</h1>
            <p className="text-sm text-muted-foreground mt-1">Monitoramento de Chamadas IA (Clara) e Auditorias QA</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
             <DashboardUserMenu user={user} />
             {data?.agentsList && data.agentsList.length > 0 && (
               <div className="relative inline-block text-left">
                 <div>
                   <button
                     id="agents-dropdown-button"
                     type="button"
                     onClick={() => setIsOpenAgentsDropdown(!isOpenAgentsDropdown)}
                     className="inline-flex w-full min-w-[160px] justify-between items-center gap-x-2 border border-input rounded-md px-3 py-2 text-sm font-medium text-foreground bg-card shadow-sm hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                     aria-expanded={isOpenAgentsDropdown}
                     aria-haspopup="true"
                   >
                     <span className="truncate">
                       {selectedAgents.length === 0
                         ? "Todos os Agentes"
                         : selectedAgents.length === 1
                         ? `${selectedAgents[0]}`
                         : `${selectedAgents.length} Agentes`}
                     </span>
                     <svg className="h-4 w-4 text-muted-foreground flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                       <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                     </svg>
                   </button>
                 </div>

                 {isOpenAgentsDropdown && (
                    <div className="absolute right-0 z-50 mt-2 min-w-[14rem] w-max max-w-xs sm:max-w-md origin-top-right rounded-md bg-card border border-border shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none" role="none">
                     <div className="py-1" role="none">
                       <div className="px-3 py-2 border-b border-border flex justify-between items-center bg-muted/30">
                         <span className="text-xs font-semibold text-muted-foreground">Filtrar Agentes</span>
                          {selectedAgents.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAgents([]);
                                setCurrentPage(1);
                              }}
                              className="text-xs text-primary hover:underline font-medium"
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                        <div className="py-1 max-h-48 overflow-y-auto">
                          {data.agentsList.map((agent: string) => {
                            const isChecked = selectedAgents.includes(agent);
                            return (
                              <label
                                key={agent}
                                className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-accent cursor-pointer gap-3 transition-colors select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedAgents(selectedAgents.filter((a) => a !== agent));
                                    } else {
                                      setSelectedAgents([...selectedAgents, agent]);
                                    }
                                    setCurrentPage(1);
                                  }}
                                 className="rounded border-input text-primary focus:ring-ring h-4 w-4 cursor-pointer accent-primary"
                               />
                               <span className="whitespace-nowrap">{agent}</span>
                             </label>
                           );
                         })}
                       </div>
                     </div>
                   </div>
                 )}
               </div>
             )}
             <select
               value={dateMode}
               onChange={(e) => {
                 const mode = e.target.value as "all" | "single" | "range";
                 setDateMode(mode);
                 setCurrentPage(1);
                 if (mode === "all") {
                   setStartDate("");
                   setEndDate("");
                 }
               }}
               className="border border-input rounded-md px-3 py-2 text-sm text-foreground bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all cursor-pointer"
             >
               <option value="all">Todas as Datas</option>
               <option value="single">Dia Único</option>
               <option value="range">Período</option>
             </select>

             {dateMode === "single" && (
               <input
                 type="date"
                 value={startDate}
                 onChange={(e) => {
                   setStartDate(e.target.value);
                   setCurrentPage(1);
                 }}
                 className="border border-input rounded-md px-3 py-2 text-sm text-foreground bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-ring animate-in fade-in slide-in-from-top-1 duration-200"
               />
             )}

             {dateMode === "range" && (
               <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                 <input
                   type="date"
                   value={startDate}
                   onChange={(e) => {
                     setStartDate(e.target.value);
                     setCurrentPage(1);
                   }}
                   className="border border-input rounded-md px-3 py-2 text-sm text-foreground bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                   placeholder="Data de início"
                 />
                 <span className="text-xs text-muted-foreground font-medium select-none">até</span>
                 <input
                   type="date"
                   value={endDate}
                   onChange={(e) => {
                     setEndDate(e.target.value);
                     setCurrentPage(1);
                   }}
                   className="border border-input rounded-md px-3 py-2 text-sm text-foreground bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                   placeholder="Data de término"
                 />
               </div>
             )}
             <div className="flex items-center space-x-2 bg-blue-50 px-3 py-2 rounded-md border border-blue-100">
               <Activity className="h-5 w-5 text-blue-600" />
               <span className="font-semibold text-md text-blue-800">IA Clara</span>
             </div>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Chamadas</CardTitle>
              <Phone className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-foreground">{kpis.totalCalls}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio (TMA)</CardTitle>
              <Clock className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-foreground">{kpis.tma}</div>
                <span className="text-sm font-normal text-muted-foreground">min</span>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Nota Média de QA</CardTitle>
              <Award className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-foreground">{kpis.qaAverage}</div>
                <span className="text-sm font-normal text-muted-foreground">/ 10</span>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Transferências</CardTitle>
              <Users className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-foreground">{kpis.transferCount || 0}</div>
                <div className="text-xs font-semibold text-orange-700 bg-orange-100 dark:bg-orange-950/40 dark:text-orange-300 px-2 py-0.5 rounded-full">
                  {kpis.transferRate}%
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Resolvidas (Sem Transf.)</CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-foreground">{kpis.resolvedCount || 0}</div>
                <div className="text-xs font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  {kpis.resolvedRate}%
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <CardTitle className="text-lg font-bold text-foreground">Motivos de Contato</CardTitle>
              {filterReason && (
                <Button variant="outline" size="sm" onClick={() => { setFilterReason(null); setCurrentPage(1); }} className="h-7 text-xs">
                  Limpar Filtro
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-6 h-[300px] flex items-center justify-center">
              {charts.reasons.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full h-full items-center">
                  <div className="relative w-full h-full flex items-center justify-center">
                    {isMounted && (
                      <ResponsiveContainer width="99.9%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie
                            data={charts.reasons}
                            cx="50%"
                            cy="50%"
                            innerRadius="70%"
                            outerRadius="90%"
                            paddingAngle={3}
                            stroke="none"
                            dataKey="value"
                            onClick={(data) => {
                              setFilterReason(filterReason === data?.name ? null : (data?.name || null));
                              setCurrentPage(1);
                            }}
                            className="cursor-pointer focus:outline-none"
                          >
                            {charts.reasons.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={COLORS[index % COLORS.length]} 
                                className={`transition-opacity duration-300 focus:outline-none ${
                                  filterReason && filterReason !== entry.name ? "opacity-25" : "hover:opacity-85"
                                }`}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            content={<CustomPieTooltip total={charts.reasons.reduce((sum, item) => sum + item.value, 0)} />}
                            contentStyle={{ backgroundColor: "transparent", border: "none", boxShadow: "none" }}
                            wrapperStyle={{ zIndex: 100 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                      <span className="text-3xl font-extrabold text-foreground tracking-tight">
                        {charts.reasons.reduce((sum, item) => sum + item.value, 0)}
                      </span>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        Motivos
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-full overflow-y-auto pr-1">
                    {charts.reasons.map((entry, index) => {
                      const totalValue = charts.reasons.reduce((sum, item) => sum + item.value, 0) || 1;
                      const percentage = ((entry.value / totalValue) * 100).toFixed(0);
                      const isSelected = filterReason === entry.name;
                      const color = COLORS[index % COLORS.length];

                      return (
                        <button
                          key={entry.name}
                          onClick={() => {
                            setFilterReason(isSelected ? null : entry.name);
                            setCurrentPage(1);
                          }}
                          className={`flex items-center justify-between p-2 rounded-lg text-left text-xs font-medium transition-all hover:bg-accent border border-transparent ${
                            isSelected ? "bg-accent border-border shadow-sm" : "opacity-85 hover:opacity-100"
                          } ${filterReason && !isSelected ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate text-foreground font-semibold">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-muted-foreground font-mono font-medium">{entry.value}</span>
                            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold font-mono">
                              {percentage}%
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados suficientes</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-lg font-bold text-foreground">Desempenho da IA (QA % de Acertos)</CardTitle>
            </CardHeader>
            <CardContent className="p-6 h-[300px]">
              {isMounted && (
                <ResponsiveContainer width="99.9%" height="100%" minWidth={0}>
                  <BarChart data={charts.performance} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="barSuccess" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="barWarning" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="barDanger" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.3} />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={140}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fontWeight: 500, fill: "var(--foreground)" }}
                    />
                    <RechartsTooltip
                      content={<CustomBarTooltip />}
                      contentStyle={{ backgroundColor: "transparent", border: "none", boxShadow: "none" }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 9999, 9999, 0]}
                      barSize={16}
                      background={{ fill: "var(--muted)", opacity: 0.15, radius: 9999 }}
                    >
                      {charts.performance.map((entry, index) => {
                        const fillUrl =
                          entry.value > 80
                            ? "url(#barSuccess)"
                            : entry.value > 50
                            ? "url(#barWarning)"
                            : "url(#barDanger)";
                        return (
                          <Cell key={`cell-${index}`} fill={fillUrl} className="transition-all duration-300 hover:opacity-85" />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
            <CardTitle className="text-lg text-foreground">Últimas Chamadas</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar telefone, motivo, agente..."
                className="pl-9 bg-background border-input focus-visible:ring-ring"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead className="font-semibold cursor-pointer select-none hover:bg-muted transition-colors" onClick={() => requestSort('start_time')}>
                    <div className="flex items-center gap-1">Data/Hora <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></div>
                  </TableHead>
                  <TableHead className="font-semibold cursor-pointer select-none hover:bg-muted transition-colors" onClick={() => requestSort('user_phone')}>
                    <div className="flex items-center gap-1">Telefone <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></div>
                  </TableHead>
                  <TableHead className="font-semibold cursor-pointer select-none hover:bg-muted transition-colors" onClick={() => requestSort('agent_name')}>
                    <div className="flex items-center gap-1">Agente <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></div>
                  </TableHead>
                  <TableHead className="font-semibold cursor-pointer select-none hover:bg-muted transition-colors" onClick={() => requestSort('motivo_contato')}>
                    <div className="flex items-center gap-1">Motivo <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></div>
                  </TableHead>
                  <TableHead className="font-semibold cursor-pointer select-none hover:bg-muted transition-colors" onClick={() => requestSort('nota_qa')}>
                    <div className="flex items-center gap-1">Nota QA <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></div>
                  </TableHead>
                  <TableHead className="font-semibold text-center cursor-pointer select-none hover:bg-muted transition-colors" onClick={() => requestSort('transferido')}>
                    <div className="flex items-center justify-center gap-1">Transferido <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></div>
                  </TableHead>
                  <TableHead className="font-semibold cursor-pointer select-none hover:bg-muted transition-colors" onClick={() => requestSort('status')}>
                    <div className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></div>
                  </TableHead>
                  <TableHead className="text-left font-semibold">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCalls.length > 0 ? (
                  paginatedCalls.map((call) => (
                    <TableRow key={call.call_sid} className="hover:bg-muted/50">
                      <TableCell className="text-sm">
                        {call.start_time ? format(new Date(call.start_time), "dd MMM yyyy, HH:mm", { locale: ptBR }) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{call.user_phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-medium">{call.agent_name || '-'}</TableCell>
                      <TableCell className="text-sm truncate max-w-[200px]" title={call.motivo_contato}>{call.motivo_contato}</TableCell>
                      <TableCell>
                        {call.nota_qa !== null ? (
                          <Badge variant={Number(call.nota_qa) >= 8 ? "default" : Number(call.nota_qa) >= 5 ? "secondary" : "destructive"} className={Number(call.nota_qa) >= 8 ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}>
                            {Number(call.nota_qa).toFixed(1)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Pendente</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {call.transferido ? (
                          <span className="inline-flex items-center text-orange-600 bg-orange-50 px-2 py-1 rounded-md text-xs font-medium border border-orange-200">
                            <CornerUpRight className="w-3 h-3 mr-1" /> Sim
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {call.status === 'completed' ? (
                          <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50"><CheckCircle className="w-3 h-3 mr-1"/> Concluída</Badge>
                        ) : call.status === 'failed' ? (
                          <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50"><XCircle className="w-3 h-3 mr-1"/> Falha</Badge>
                        ) : (
                          <Badge variant="outline" className="border-border text-muted-foreground bg-muted/50">{call.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedCallSid(call.call_sid)} className="-ml-2.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                          Ver Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground text-sm">
                      Nenhuma avaliação encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t px-6 py-4 bg-muted/20">
              <div className="text-sm text-muted-foreground">
                Mostrando <span className="font-semibold text-foreground">{totalItems === 0 ? 0 : startIndex + 1}</span> a{" "}
                <span className="font-semibold text-foreground">{Math.min(endIndex, totalItems)}</span> de{" "}
                <span className="font-semibold text-foreground">{totalItems}</span> avaliações
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(activePage - 1)}
                  disabled={activePage === 1}
                  className="h-8 text-xs font-medium px-3"
                >
                  Anterior
                </Button>

                <div className="hidden sm:flex items-center gap-1">
                  {getPageNumbers().map((page, index) => {
                    if (page === "...") {
                      return (
                        <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground text-sm select-none">
                          ...
                        </span>
                      );
                    }
                    return (
                      <Button
                        key={`page-${page}`}
                        variant={activePage === page ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setCurrentPage(Number(page))}
                        className={`h-8 w-8 text-xs font-medium p-0 rounded-md transition-all ${
                          activePage === page ? "bg-primary text-primary-foreground shadow-sm font-semibold" : ""
                        }`}
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(activePage + 1)}
                  disabled={activePage === totalPages}
                  className="h-8 text-xs font-medium px-3"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {selectedCallSid && (
        <CallDetailsModal 
          call={latestCalls.find((call) => call.call_sid === selectedCallSid)} 
          isOpen={!!selectedCallSid} 
          onClose={() => setSelectedCallSid(null)} 
        />
      )}
    </div>
  );
}

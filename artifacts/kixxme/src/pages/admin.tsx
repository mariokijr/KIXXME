import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminSummary,
  getGetAdminSummaryQueryKey,
  useListAdminReports,
  getListAdminReportsQueryKey,
  useGetAdminReport,
  getGetAdminReportQueryKey,
  useResolveAdminReport,
  useListAdminFlags,
  getListAdminFlagsQueryKey,
  useReviewAdminFlag,
  useSuspendUser,
  useBanUser,
  useLiftUserModeration,
  useAdminRemovePhoto,
  type AdminReport,
  type AdminFlag,
  type Message,
  type ProfilePhoto,
  type PublicProfile,
  type ResolveReportRequestStatus as ResolveStatus,
  type ResolveReportRequestAction as ResolveAction,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ShieldAlert,
  Flag,
  AlertTriangle,
  Ban,
  Clock,
  Loader2,
  Trash2,
  Search,
  ShieldCheck,
  ShieldOff,
  User as UserIcon,
} from "lucide-react";

const REPORTS_KEY = "/api/admin/reports";
const FLAGS_KEY = "/api/admin/flags";

const REPORT_TYPE_LABELS: Record<string, string> = {
  spam: "Spam",
  fake_profile: "Perfil falso",
  harassment: "Acoso",
  video_behavior: "Vídeo",
  underage: "Menor de edad",
  other: "Otro",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  profile: "Perfil",
  photo: "Foto",
  message: "Mensaje",
  video_call: "Videollamada",
  live_user: "Live",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  in_progress: "En curso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function errMsg(err: any, fallback: string): string {
  return err?.data?.error ?? err?.message ?? fallback;
}

export default function AdminPage() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"reports" | "flags">("reports");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const { data: summary } = useGetAdminSummary({
    query: {
      enabled: !!session,
      queryKey: getGetAdminSummaryQueryKey(),
      refetchInterval: 30_000,
    },
  });

  return (
    <div className="min-h-[100dvh] pb-10">
      <header className="sticky top-0 z-20 px-4 py-4 flex items-center gap-3 border-b border-border/40 backdrop-blur-xl"
        style={{ background: "rgba(13,11,26,0.85)" }}>
        <button
          onClick={() => setLocation("/profile")}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-border/50 text-muted-foreground hover:text-foreground"
          data-testid="button-admin-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h1 className="font-display text-2xl tracking-widest text-foreground">
            Moderación
          </h1>
        </div>
      </header>

      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        <SummaryCard
          icon={<Flag className="w-4 h-4" />}
          label="Reportes abiertos"
          value={summary?.openReports ?? 0}
          tone="pink"
        />
        <SummaryCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Alertas abiertas"
          value={summary?.openFlags ?? 0}
          tone="amber"
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          label="Suspendidos"
          value={summary?.suspended ?? 0}
          tone="purple"
        />
        <SummaryCard
          icon={<Ban className="w-4 h-4" />}
          label="Baneados"
          value={summary?.banned ?? 0}
          tone="red"
        />
      </div>

      <div className="px-4 pt-5">
        <div className="flex gap-2 p-1 rounded-xl border border-border/40"
          style={{ background: "rgba(255,255,255,0.03)" }}>
          {(["reports", "flags"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 h-10 rounded-lg font-sans text-sm font-medium transition-colors ${
                tab === t
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={
                tab === t
                  ? { background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }
                  : undefined
              }
              data-testid={`tab-admin-${t}`}
            >
              {t === "reports" ? "Reportes" : "Alertas"}
            </button>
          ))}
        </div>
      </div>

      {tab === "reports" ? (
        <ReportsTab onSelect={setSelectedReportId} />
      ) : (
        <FlagsTab />
      )}

      <ReportDetailDialog
        reportId={selectedReportId}
        onClose={() => setSelectedReportId(null)}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "pink" | "amber" | "purple" | "red";
}) {
  const colors: Record<string, string> = {
    pink: "text-pink-400",
    amber: "text-amber-400",
    purple: "text-primary",
    red: "text-red-400",
  };
  return (
    <div className="rounded-2xl border border-border/40 p-4"
      style={{ background: "rgba(13,11,26,0.7)" }}>
      <div className={`flex items-center gap-1.5 ${colors[tone]}`}>
        {icon}
        <span className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="font-display text-3xl tracking-wide text-foreground mt-1">
        {value}
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`px-3 py-1.5 rounded-full font-sans text-xs whitespace-nowrap transition-colors border ${
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border/50 bg-input/20 text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

function ReportsTab({ onSelect }: { onSelect: (id: string) => void }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<string>("open");
  const [reportType, setReportType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const params = {
    ...(status ? { status } : {}),
    ...(reportType ? { reportType } : {}),
    ...(debounced ? { q: debounced } : {}),
  };

  const { data, isLoading } = useListAdminReports(params, {
    query: {
      enabled: !!session,
      queryKey: getListAdminReportsQueryKey(params),
    },
  });

  const reports = data?.reports ?? [];

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en el detalle del reporte…"
          className="h-11 pl-9 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
          data-testid="input-admin-search"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { v: "open", l: "Abiertos" },
          { v: "in_progress", l: "En curso" },
          { v: "resolved", l: "Resueltos" },
          { v: "closed", l: "Cerrados" },
          { v: "", l: "Todos" },
        ].map((s) => (
          <Chip
            key={s.v || "all"}
            active={status === s.v}
            onClick={() => setStatus(s.v)}
            testId={`chip-status-${s.v || "all"}`}
          >
            {s.l}
          </Chip>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Chip active={reportType === ""} onClick={() => setReportType("")}>
          Todos los motivos
        </Chip>
        {Object.entries(REPORT_TYPE_LABELS).map(([v, l]) => (
          <Chip
            key={v}
            active={reportType === v}
            onClick={() => setReportType(v)}
            testId={`chip-type-${v}`}
          >
            {l}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<Flag className="w-7 h-7" />}
          title="Sin reportes"
          subtitle="No hay reportes que coincidan con estos filtros."
        />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} onClick={() => onSelect(r.id)} />
          ))}
          {data && (
            <p className="text-center font-sans text-[11px] text-muted-foreground pt-2">
              {reports.length} de {data.total}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "open"
      ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
      : status === "in_progress"
        ? "text-sky-300 border-sky-500/40 bg-sky-500/10"
        : "text-green-300 border-green-500/40 bg-green-500/10";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-sans border ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ReportRow({
  report,
  onClick,
}: {
  report: AdminReport;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-border/40 p-4 hover:border-primary/40 transition-colors"
      style={{ background: "rgba(13,11,26,0.6)" }}
      data-testid={`report-row-${report.id}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-primary/40 bg-primary/10 text-primary">
            {report.reportType
              ? REPORT_TYPE_LABELS[report.reportType] ?? report.reportType
              : "—"}
          </span>
          {report.targetType && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-border/50 text-muted-foreground">
              {TARGET_TYPE_LABELS[report.targetType] ?? report.targetType}
            </span>
          )}
        </div>
        <StatusBadge status={report.status} />
      </div>
      <p className="font-sans text-sm text-foreground/90 line-clamp-2">
        {report.message || "Sin detalle"}
      </p>
      <div className="flex items-center justify-between mt-2 font-sans text-[11px] text-muted-foreground">
        <span>
          {report.reporterUsername ?? "?"} →{" "}
          <span className="text-foreground/70">
            {report.targetUsername ?? "—"}
          </span>
        </span>
        <span>{fmtDate(report.createdAt)}</span>
      </div>
    </button>
  );
}

function ReportDetailDialog({
  reportId,
  onClose,
}: {
  reportId: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useGetAdminReport(reportId ?? "", {
    query: {
      enabled: !!reportId,
      queryKey: getGetAdminReportQueryKey(reportId ?? ""),
    },
  });

  const resolve = useResolveAdminReport();
  const suspend = useSuspendUser();
  const ban = useBanUser();
  const lift = useLiftUserModeration();
  const removePhoto = useAdminRemovePhoto();

  const [status, setStatus] = useState<ResolveStatus>("resolved");
  const [action, setAction] = useState<ResolveAction>("none");
  const [note, setNote] = useState("");

  React.useEffect(() => {
    if (data?.report) {
      setStatus(
        (data.report.status as ResolveStatus) === "open"
          ? "resolved"
          : (data.report.status as ResolveStatus),
      );
      setAction("none");
      setNote("");
    }
  }, [data?.report?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [REPORTS_KEY] });
    qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
    if (reportId) {
      qc.invalidateQueries({ queryKey: getGetAdminReportQueryKey(reportId) });
    }
  };

  const handleResolve = () => {
    if (!reportId) return;
    resolve.mutate(
      { id: reportId, data: { status, note: note.trim() || undefined, action } },
      {
        onSuccess: () => {
          toast({ title: "Reporte actualizado" });
          invalidate();
          onClose();
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo actualizar",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  const target = data?.target;
  const targetId = data?.report?.targetUserId ?? null;

  const handleSuspend = (durationDays: number | null) => {
    if (!targetId) return;
    suspend.mutate(
      {
        userId: targetId,
        data: {
          ...(durationDays ? { durationDays } : {}),
          reason: note.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Usuario suspendido" });
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo suspender",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  const handleBan = () => {
    if (!targetId) return;
    ban.mutate(
      { userId: targetId, data: { reason: note.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Usuario baneado" });
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo banear",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  const handleLift = () => {
    if (!targetId) return;
    lift.mutate(
      { userId: targetId },
      {
        onSuccess: () => {
          toast({ title: "Sanción levantada" });
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo levantar",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  const handleRemovePhoto = (photoId: string) => {
    removePhoto.mutate(
      { photoId },
      {
        onSuccess: () => {
          toast({ title: "Foto eliminada" });
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo eliminar",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  const busy =
    resolve.isPending ||
    suspend.isPending ||
    ban.isPending ||
    lift.isPending ||
    removePhoto.isPending;

  return (
    <Dialog open={!!reportId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-widest text-gradient-brand flex items-center gap-2">
            <Flag className="w-5 h-5" />
            Reporte
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/40 p-3 space-y-2"
              style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-primary/40 bg-primary/10 text-primary">
                  {data.report.reportType
                    ? REPORT_TYPE_LABELS[data.report.reportType] ??
                      data.report.reportType
                    : "—"}
                </span>
                {data.report.targetType && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-border/50 text-muted-foreground">
                    {TARGET_TYPE_LABELS[data.report.targetType] ??
                      data.report.targetType}
                  </span>
                )}
                <StatusBadge status={data.report.status} />
                <span className="font-sans text-[11px] text-muted-foreground ml-auto">
                  {fmtDate(data.report.createdAt)}
                </span>
              </div>
              <p className="font-sans text-sm text-foreground/90 whitespace-pre-wrap">
                {data.report.message || "Sin detalle"}
              </p>
              {data.report.actionTaken && data.report.actionTaken !== "none" && (
                <p className="font-sans text-[11px] text-amber-300">
                  Acción registrada: {data.report.actionTaken}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PersonCard
                label="Reportado por"
                profile={data.reporter}
                username={data.report.reporterUsername}
              />
              <PersonCard
                label="Usuario reportado"
                profile={data.target}
                username={data.report.targetUsername}
              />
            </div>

            {targetId && (
              <div className="rounded-xl border border-border/40 p-3 space-y-2"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs text-muted-foreground">
                    Estado del usuario reportado
                  </span>
                  <ModStateBadge
                    state={data.targetState}
                    until={data.targetSuspendedUntil}
                  />
                </div>
                <p className="font-sans text-[11px] text-muted-foreground">
                  {data.targetReportCount} reporte(s) abierto(s) contra este
                  usuario.
                </p>
              </div>
            )}

            {data.reportedMessage && (
              <div className="space-y-1.5">
                <SectionLabel>Mensaje reportado</SectionLabel>
                <MessageBubble
                  message={data.reportedMessage}
                  highlight
                  targetId={targetId}
                />
              </div>
            )}

            {data.messageContext.length > 0 && (
              <div className="space-y-1.5">
                <SectionLabel>Contexto de la conversación</SectionLabel>
                <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-xl border border-border/30 p-2"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  {data.messageContext.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      highlight={!!data.reportedMessage && m.id === data.reportedMessage.id}
                      targetId={targetId}
                    />
                  ))}
                </div>
              </div>
            )}

            {data.call && (
              <div className="space-y-1.5">
                <SectionLabel>Videollamada</SectionLabel>
                <div className="rounded-xl border border-border/40 p-3 font-sans text-xs text-muted-foreground space-y-1"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <p>Estado: {data.call.status}</p>
                  <p>Inicio: {fmtDate(data.call.createdAt)}</p>
                  {data.call.endedAt && <p>Fin: {fmtDate(data.call.endedAt)}</p>}
                </div>
              </div>
            )}

            {data.targetPhotos.length > 0 && (
              <div className="space-y-1.5">
                <SectionLabel>Fotos del usuario</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  {data.targetPhotos.map((p) => (
                    <PhotoCell
                      key={p.id}
                      photo={p}
                      onRemove={() => handleRemovePhoto(p.id)}
                      disabled={busy}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-1 border-t border-border/40">
              <SectionLabel>Resolver reporte</SectionLabel>
              <div className="space-y-1.5">
                <span className="font-sans text-[11px] text-muted-foreground">
                  Nuevo estado
                </span>
                <div className="flex gap-2 flex-wrap">
                  {(["in_progress", "resolved", "closed"] as ResolveStatus[]).map(
                    (s) => (
                      <Chip
                        key={s}
                        active={status === s}
                        onClick={() => setStatus(s)}
                        testId={`chip-resolve-${s}`}
                      >
                        {STATUS_LABELS[s]}
                      </Chip>
                    ),
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-sans text-[11px] text-muted-foreground">
                  Acción (opcional)
                </span>
                <div className="flex gap-2 flex-wrap">
                  {(
                    [
                      { v: "none", l: "Ninguna" },
                      { v: "suspend", l: "Suspender" },
                      { v: "ban", l: "Banear" },
                      { v: "remove_photo", l: "Quitar foto" },
                      { v: "dismiss", l: "Descartar" },
                    ] as { v: ResolveAction; l: string }[]
                  ).map((a) => (
                    <Chip
                      key={a.v}
                      active={action === a.v}
                      onClick={() => setAction(a.v)}
                      testId={`chip-action-${a.v}`}
                    >
                      {a.l}
                    </Chip>
                  ))}
                </div>
              </div>

              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Nota interna / motivo de la sanción…"
                className="rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm resize-none"
                data-testid="input-resolve-note"
              />

              <button
                onClick={handleResolve}
                disabled={busy}
                className="w-full h-12 rounded-xl font-display text-lg tracking-widest border-0 text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                data-testid="button-resolve-submit"
              >
                {resolve.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                Guardar resolución
              </button>
            </div>

            {targetId && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <SectionLabel>Sanciones rápidas</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    onClick={() => handleSuspend(7)}
                    disabled={busy}
                    tone="amber"
                    icon={<Clock className="w-4 h-4" />}
                    testId="button-suspend-7"
                  >
                    Suspender 7d
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleSuspend(30)}
                    disabled={busy}
                    tone="amber"
                    icon={<Clock className="w-4 h-4" />}
                    testId="button-suspend-30"
                  >
                    Suspender 30d
                  </ActionButton>
                  <ActionButton
                    onClick={handleBan}
                    disabled={busy}
                    tone="red"
                    icon={<Ban className="w-4 h-4" />}
                    testId="button-ban"
                  >
                    Banear
                  </ActionButton>
                  <ActionButton
                    onClick={handleLift}
                    disabled={busy}
                    tone="green"
                    icon={<ShieldOff className="w-4 h-4" />}
                    testId="button-lift"
                  >
                    Levantar sanción
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display text-sm tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

function ModStateBadge({
  state,
  until,
}: {
  state: string;
  until?: string | null;
}) {
  if (state === "banned") {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-red-500/40 bg-red-500/10 text-red-300">
        Baneado
      </span>
    );
  }
  if (state === "suspended") {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-amber-500/40 bg-amber-500/10 text-amber-300">
        Suspendido{until ? ` · hasta ${fmtDate(until)}` : " · indefinido"}
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-green-500/40 bg-green-500/10 text-green-300">
      Activo
    </span>
  );
}

function PersonCard({
  label,
  profile,
  username,
}: {
  label: string;
  profile?: PublicProfile | null;
  username?: string | null;
}) {
  const name = profile?.username ?? username ?? "—";
  return (
    <div className="rounded-xl border border-border/40 p-3"
      style={{ background: "rgba(255,255,255,0.02)" }}>
      <span className="font-sans text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="w-9 h-9 rounded-lg overflow-hidden bg-card flex items-center justify-center flex-shrink-0 border border-border/40">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-sans text-sm text-foreground truncate">{name}</p>
          {profile?.city && (
            <p className="font-sans text-[11px] text-muted-foreground truncate">
              {profile.city}
              {profile.age ? ` · ${profile.age}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  highlight,
  targetId,
}: {
  message: Message;
  highlight?: boolean;
  targetId: string | null;
}) {
  const fromTarget = targetId && message.sender_id === targetId;
  return (
    <div
      className={`rounded-lg px-3 py-2 border ${
        highlight
          ? "border-red-500/50 bg-red-500/10"
          : "border-border/30 bg-input/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="font-sans text-[10px] text-muted-foreground">
          {fromTarget ? "Usuario reportado" : "Otro"}
        </span>
        <span className="font-sans text-[10px] text-muted-foreground">
          {fmtDate(message.created_at)}
        </span>
      </div>
      {message.image_url ? (
        <img
          src={message.image_url}
          alt=""
          className="max-h-40 rounded-md object-cover"
        />
      ) : (
        <p className="font-sans text-sm text-foreground/90 whitespace-pre-wrap">
          {message.deleted_at ? "(mensaje eliminado)" : message.content}
        </p>
      )}
    </div>
  );
}

function PhotoCell({
  photo,
  onRemove,
  disabled,
}: {
  photo: ProfilePhoto;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-border/30"
      style={{ aspectRatio: "1" }}>
      <img src={photo.url} alt="" className="w-full h-full object-cover" />
      <button
        onClick={onRemove}
        disabled={disabled}
        className="absolute bottom-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-lg text-white disabled:opacity-50"
        style={{ background: "rgba(239,68,68,0.85)" }}
        title="Eliminar foto"
        data-testid={`button-remove-photo-${photo.id}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  tone,
  icon,
  children,
  testId,
}: {
  onClick: () => void;
  disabled: boolean;
  tone: "amber" | "red" | "green";
  icon: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  const tones: Record<string, string> = {
    amber: "border-amber-500/40 text-amber-300 hover:bg-amber-500/10",
    red: "border-red-500/40 text-red-300 hover:bg-red-500/10",
    green: "border-green-500/40 text-green-300 hover:bg-green-500/10",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`h-11 rounded-xl border flex items-center justify-center gap-2 font-sans text-sm font-medium transition-colors disabled:opacity-50 ${tones[tone]}`}
    >
      {icon}
      {children}
    </button>
  );
}

function FlagsTab() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("open");

  const params = { status };
  const { data, isLoading } = useListAdminFlags(params, {
    query: {
      enabled: !!session,
      queryKey: getListAdminFlagsQueryKey(params),
    },
  });
  const review = useReviewAdminFlag();

  const flags = data?.flags ?? [];

  const handleReview = (id: string, next: "reviewed" | "dismissed") => {
    review.mutate(
      { id, data: { status: next } },
      {
        onSuccess: () => {
          toast({ title: next === "reviewed" ? "Alerta revisada" : "Alerta descartada" });
          qc.invalidateQueries({ queryKey: [FLAGS_KEY] });
          qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo actualizar",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { v: "open", l: "Abiertas" },
          { v: "reviewed", l: "Revisadas" },
          { v: "dismissed", l: "Descartadas" },
        ].map((s) => (
          <Chip
            key={s.v}
            active={status === s.v}
            onClick={() => setStatus(s.v)}
            testId={`chip-flag-status-${s.v}`}
          >
            {s.l}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : flags.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-7 h-7" />}
          title="Sin alertas"
          subtitle="No hay cuentas marcadas automáticamente."
        />
      ) : (
        <div className="space-y-2">
          {flags.map((f) => (
            <FlagRow
              key={f.id}
              flag={f}
              busy={review.isPending}
              onReview={(next) => handleReview(f.id, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FlagRow({
  flag,
  busy,
  onReview,
}: {
  flag: AdminFlag;
  busy: boolean;
  onReview: (next: "reviewed" | "dismissed") => void;
}) {
  const reasonLabel =
    flag.reason === "report_threshold"
      ? "Muchos reportes"
      : flag.reason === "spam_pattern"
        ? "Patrón de spam"
        : flag.reason;
  return (
    <div className="rounded-2xl border border-amber-500/30 p-4"
      style={{ background: "rgba(245,158,11,0.05)" }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-amber-500/40 bg-amber-500/10 text-amber-300">
          {reasonLabel}
        </span>
        <span className="font-sans text-[11px] text-muted-foreground">
          {fmtDate(flag.createdAt)}
        </span>
      </div>
      <p className="font-sans text-sm text-foreground">
        {flag.username ?? flag.userId}
      </p>
      {flag.detail && (
        <p className="font-sans text-xs text-muted-foreground mt-0.5">
          {flag.detail}
        </p>
      )}
      <p className="font-sans text-[11px] text-muted-foreground mt-1">
        Recuento: {flag.count}
      </p>
      {flag.status === "open" && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <ActionButton
            onClick={() => onReview("reviewed")}
            disabled={busy}
            tone="green"
            icon={<ShieldCheck className="w-4 h-4" />}
            testId={`button-flag-review-${flag.id}`}
          >
            Revisada
          </ActionButton>
          <ActionButton
            onClick={() => onReview("dismissed")}
            disabled={busy}
            tone="amber"
            icon={<ShieldOff className="w-4 h-4" />}
            testId={`button-flag-dismiss-${flag.id}`}
          >
            Descartar
          </ActionButton>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-muted-foreground mb-3 border border-border/40">
        {icon}
      </div>
      <p className="font-display text-lg tracking-widest text-foreground">{title}</p>
      <p className="font-sans text-sm text-muted-foreground mt-1 max-w-xs">
        {subtitle}
      </p>
    </div>
  );
}

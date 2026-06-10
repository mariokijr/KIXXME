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
  useListAdminVerifications,
  getListAdminVerificationsQueryKey,
  useReviewAdminVerification,
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useGetAdminUser,
  getGetAdminUserQueryKey,
  useWarnUser,
  useRemoveUser,
  useRestoreUser,
  useListAdminTickets,
  getListAdminTicketsQueryKey,
  useGetSupportTicket,
  getGetSupportTicketQueryKey,
  useSendSupportMessage,
  useAdminCreateTicket,
  useSetAdminTicketStatus,
  getListSupportTicketsQueryKey,
  getGetNotificationsSummaryQueryKey,
  type AdminReport,
  type AdminFlag,
  type AdminVerificationItem,
  type AdminUserItem,
  type ListAdminUsersParams,
  type ListAdminTicketsParams,
  type SupportTicket,
  type SupportTicketStatus,
  type SetTicketStatusRequestStatus,
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
  BadgeCheck,
  User as UserIcon,
  Users,
  RotateCcw,
  Mail,
  LifeBuoy,
  Send,
  Plus,
  MessageSquare,
  ChevronLeft,
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
  const [tab, setTab] = useState<
    "reports" | "flags" | "verifications" | "users" | "support"
  >("reports");
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
        <SummaryCard
          icon={<BadgeCheck className="w-4 h-4" />}
          label="Verificaciones"
          value={summary?.pendingVerifications ?? 0}
          tone="purple"
        />
        <SummaryCard
          icon={<Trash2 className="w-4 h-4" />}
          label="Eliminados"
          value={summary?.removed ?? 0}
          tone="red"
        />
        <SummaryCard
          icon={<LifeBuoy className="w-4 h-4" />}
          label="Tickets abiertos"
          value={summary?.openTickets ?? 0}
          tone="amber"
        />
      </div>

      <div className="px-4 pt-5">
        <div className="flex gap-2 p-1 rounded-xl border border-border/40 overflow-x-auto no-scrollbar"
          style={{ background: "rgba(255,255,255,0.03)" }}>
          {(
            ["reports", "flags", "verifications", "users", "support"] as const
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[84px] h-10 px-2 rounded-lg font-sans text-sm font-medium whitespace-nowrap transition-colors ${
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
              {t === "reports"
                ? "Reportes"
                : t === "flags"
                  ? "Alertas"
                  : t === "verifications"
                    ? "Verif."
                    : t === "users"
                      ? "Usuarios"
                      : "Soporte"}
            </button>
          ))}
        </div>
      </div>

      {tab === "reports" ? (
        <ReportsTab onSelect={setSelectedReportId} />
      ) : tab === "flags" ? (
        <FlagsTab />
      ) : tab === "verifications" ? (
        <VerificationsTab />
      ) : tab === "users" ? (
        <UsersTab />
      ) : (
        <SupportTab />
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

function VerificationsTab() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useListAdminVerifications({
    query: {
      enabled: !!session,
      queryKey: getListAdminVerificationsQueryKey(),
    },
  });
  const review = useReviewAdminVerification();

  const items = data?.verifications ?? [];

  const handleReview = (
    id: string,
    decision: "approve" | "reject",
    note?: string,
  ) => {
    review.mutate(
      { id, data: { decision, ...(note ? { note } : {}) } },
      {
        onSuccess: () => {
          toast({
            title:
              decision === "approve"
                ? "Perfil verificado"
                : "Solicitud rechazada",
          });
          qc.invalidateQueries({
            queryKey: getListAdminVerificationsQueryKey(),
          });
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
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BadgeCheck className="w-7 h-7" />}
          title="Sin solicitudes"
          subtitle="No hay solicitudes de verificación pendientes."
        />
      ) : (
        <div className="space-y-3">
          {items.map((v) => (
            <VerificationRow
              key={v.id}
              item={v}
              busy={review.isPending}
              onReview={(decision, note) => handleReview(v.id, decision, note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VerificationRow({
  item,
  busy,
  onReview,
}: {
  item: AdminVerificationItem;
  busy: boolean;
  onReview: (decision: "approve" | "reject", note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const photos = item.photos ?? [];
  const meta = [
    item.age != null ? `${item.age} años` : null,
    item.city ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="rounded-2xl border border-border/40 p-4"
      style={{ background: "rgba(13,11,26,0.7)" }}
      data-testid={`verification-row-${item.id}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-primary/40 bg-primary/10 text-primary uppercase tracking-wider">
          {item.plan}
        </span>
        <span className="font-sans text-[11px] text-muted-foreground">
          {fmtDate(item.createdAt)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden border border-border/40 bg-card flex items-center justify-center flex-shrink-0">
          {item.avatar_url ? (
            <img
              src={item.avatar_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-sans text-sm text-foreground truncate">
              {item.username ?? item.userId}
            </p>
            {item.is_verified && (
              <BadgeCheck className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
            )}
          </div>
          {meta && (
            <p className="font-sans text-xs text-muted-foreground truncate">
              {meta}
            </p>
          )}
        </div>
      </div>

      {item.bio && (
        <p className="font-sans text-xs text-muted-foreground mt-2 line-clamp-3">
          {item.bio}
        </p>
      )}

      <div className="mt-3">
        <p className="font-sans text-[11px] uppercase tracking-wider text-sky-300/80 mb-1.5">
          Selfie de verificación
        </p>
        {item.selfie_url ? (
          <a
            href={item.selfie_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl overflow-hidden border border-sky-500/40"
            data-testid={`selfie-link-${item.id}`}
          >
            <img
              src={item.selfie_url}
              alt="Selfie de verificación"
              className="w-full max-h-64 object-contain bg-black/40"
              data-testid={`img-selfie-${item.id}`}
            />
          </a>
        ) : (
          <div
            className="rounded-xl border border-dashed border-border/50 p-4 text-center"
            data-testid={`selfie-missing-${item.id}`}
          >
            <p className="font-sans text-xs text-muted-foreground">Sin selfie</p>
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div className="mt-3">
          <p className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Fotos del perfil
          </p>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative rounded-lg overflow-hidden border border-border/30"
                style={{ aspectRatio: "1" }}
              >
                <img src={p.url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (opcional, visible para el usuario si rechazas)…"
        className="mt-3 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans min-h-[60px] resize-none bg-input/40 text-sm"
        data-testid={`input-verification-note-${item.id}`}
      />

      <div className="grid grid-cols-2 gap-2 mt-3">
        <ActionButton
          onClick={() => onReview("approve", note.trim() || undefined)}
          disabled={busy}
          tone="green"
          icon={<ShieldCheck className="w-4 h-4" />}
          testId={`button-verification-approve-${item.id}`}
        >
          Aprobar
        </ActionButton>
        <ActionButton
          onClick={() => onReview("reject", note.trim() || undefined)}
          disabled={busy}
          tone="red"
          icon={<ShieldOff className="w-4 h-4" />}
          testId={`button-verification-reject-${item.id}`}
        >
          Rechazar
        </ActionButton>
      </div>
    </div>
  );
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  plus: "Plus",
  gold: "Gold",
};

const STATE_LABELS: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  banned: "Baneado",
  removed: "Eliminado",
};

const STATE_TONES: Record<string, string> = {
  active: "border-green-500/40 bg-green-500/10 text-green-300",
  suspended: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  banned: "border-red-500/40 bg-red-500/10 text-red-300",
  removed: "border-red-500/40 bg-red-500/10 text-red-300",
};

const ACTION_LABELS: Record<string, string> = {
  warn: "Aviso",
  suspend: "Suspensión",
  ban: "Baneo",
  remove: "Eliminación",
  restore: "Restauración",
  lift: "Sanción levantada",
  remove_photo: "Foto eliminada",
};

function UsersTab() {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [plan, setPlan] = useState<"" | "free" | "plus" | "gold">("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "active" | "suspended" | "banned" | "removed"
  >("");
  const [page, setPage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debounced, plan, statusFilter]);

  const PAGE_SIZE = 30;
  const params: ListAdminUsersParams = {
    ...(debounced ? { q: debounced } : {}),
    ...(plan ? { plan } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, isFetching } = useListAdminUsers(params, {
    query: {
      enabled: !!session,
      queryKey: getListAdminUsersQueryKey(params),
      placeholderData: (prev) => prev,
    },
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = (page + 1) * PAGE_SIZE < total;

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por usuario o ciudad…"
          className="pl-9 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
          data-testid="input-admin-user-search"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={plan === ""} onClick={() => setPlan("")} testId="chip-plan-all">
          Todos
        </Chip>
        {(["free", "plus", "gold"] as const).map((p) => (
          <Chip
            key={p}
            active={plan === p}
            onClick={() => setPlan(p)}
            testId={`chip-plan-${p}`}
          >
            {PLAN_LABELS[p]}
          </Chip>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip
          active={statusFilter === ""}
          onClick={() => setStatusFilter("")}
          testId="chip-status-all"
        >
          Todos
        </Chip>
        {(["active", "suspended", "banned", "removed"] as const).map((s) => (
          <Chip
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            testId={`chip-status-${s}`}
          >
            {STATE_LABELS[s]}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          title="Sin usuarios"
          subtitle="No hay usuarios que coincidan con la búsqueda."
        />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onClick={() => setSelectedUserId(u.id)}
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!canPrev || isFetching}
            className="h-10 px-4 rounded-xl border border-border/50 font-sans text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 flex items-center gap-2"
            data-testid="button-users-prev"
          >
            Anterior
          </button>
          <span className="font-sans text-xs text-muted-foreground inline-flex items-center gap-2">
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Página {page + 1} de {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!canNext || isFetching}
            className="h-10 px-4 rounded-xl border border-border/50 font-sans text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 flex items-center gap-2"
            data-testid="button-users-next"
          >
            Siguiente
          </button>
        </div>
      )}

      <UserDetailDialog
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}

function UserRow({
  user,
  onClick,
}: {
  user: AdminUserItem;
  onClick: () => void;
}) {
  const meta = [user.age != null ? `${user.age} años` : null, user.city ?? null]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border border-border/40 p-3 flex items-center gap-3 text-left hover:border-primary/40 transition-colors"
      style={{ background: "rgba(13,11,26,0.7)" }}
      data-testid={`user-row-${user.id}`}
    >
      <div className="w-11 h-11 rounded-xl overflow-hidden border border-border/40 bg-card flex items-center justify-center flex-shrink-0">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <UserIcon className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-sans text-sm text-foreground truncate">
            {user.username ?? user.id}
          </p>
          {user.isVerified && (
            <BadgeCheck className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          )}
        </div>
        {meta && (
          <p className="font-sans text-xs text-muted-foreground truncate">
            {meta}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-primary/40 bg-primary/10 text-primary uppercase tracking-wider">
          {PLAN_LABELS[user.plan] ?? user.plan}
        </span>
        {user.state !== "active" && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-sans border uppercase tracking-wider ${
              STATE_TONES[user.state] ?? STATE_TONES.active
            }`}
          >
            {STATE_LABELS[user.state] ?? user.state}
          </span>
        )}
      </div>
    </button>
  );
}

function UserDetailDialog({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useGetAdminUser(userId ?? "", {
    query: {
      enabled: !!session && !!userId,
      queryKey: getGetAdminUserQueryKey(userId ?? ""),
    },
  });

  const warn = useWarnUser();
  const suspend = useSuspendUser();
  const ban = useBanUser();
  const remove = useRemoveUser();
  const restore = useRestoreUser();

  const [reason, setReason] = useState("");

  React.useEffect(() => {
    setReason("");
  }, [userId]);

  const busy =
    warn.isPending ||
    suspend.isPending ||
    ban.isPending ||
    remove.isPending ||
    restore.isPending;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
    if (userId) {
      qc.invalidateQueries({ queryKey: getGetAdminUserQueryKey(userId) });
    }
  };

  const onError = (title: string) => (err: any) =>
    toast({
      title,
      description: errMsg(err, "Inténtalo de nuevo."),
      variant: "destructive",
    });

  const onWarn = () => {
    if (!userId) return;
    const r = reason.trim();
    if (!r) {
      toast({
        title: "Escribe un motivo",
        description: "El aviso requiere un motivo para el usuario.",
        variant: "destructive",
      });
      return;
    }
    warn.mutate(
      { userId, data: { reason: r } },
      {
        onSuccess: () => {
          toast({ title: "Aviso enviado" });
          invalidate();
          setReason("");
        },
        onError: onError("No se pudo avisar"),
      },
    );
  };

  const onSuspend = (durationDays: number) => {
    if (!userId) return;
    suspend.mutate(
      { userId, data: { durationDays, reason: reason.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Usuario suspendido" });
          invalidate();
        },
        onError: onError("No se pudo suspender"),
      },
    );
  };

  const onBan = () => {
    if (!userId) return;
    ban.mutate(
      { userId, data: { reason: reason.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Usuario baneado" });
          invalidate();
        },
        onError: onError("No se pudo banear"),
      },
    );
  };

  const onRemove = () => {
    if (!userId) return;
    remove.mutate(
      { userId, data: { reason: reason.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Usuario eliminado" });
          invalidate();
        },
        onError: onError("No se pudo eliminar"),
      },
    );
  };

  const onRestore = () => {
    if (!userId) return;
    restore.mutate(
      { userId },
      {
        onSuccess: () => {
          toast({ title: "Usuario restaurado" });
          invalidate();
        },
        onError: onError("No se pudo restaurar"),
      },
    );
  };

  const user = data?.user;
  const state = user?.state ?? "active";
  const meta = [
    user?.age != null ? `${user.age} años` : null,
    user?.city ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  const photos = data?.photos ?? [];
  const history = data?.history ?? [];

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-widest text-gradient-brand flex items-center gap-2">
            <UserIcon className="w-5 h-5" />
            Usuario
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data || !user ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-border/40 bg-card flex items-center justify-center flex-shrink-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-display text-lg tracking-wide text-foreground truncate">
                    {user.username ?? user.id}
                  </p>
                  {user.isVerified && (
                    <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  )}
                </div>
                {meta && (
                  <p className="font-sans text-xs text-muted-foreground truncate">
                    {meta}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-sans border border-primary/40 bg-primary/10 text-primary uppercase tracking-wider">
                    {PLAN_LABELS[user.plan] ?? user.plan}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-sans border uppercase tracking-wider ${
                      STATE_TONES[state] ?? STATE_TONES.active
                    }`}
                  >
                    {STATE_LABELS[state] ?? state}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border border-border/40 p-3 space-y-1.5"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              {data.email && (
                <div className="flex items-center gap-2 text-xs font-sans text-muted-foreground">
                  <Mail className="w-3.5 h-3.5" />
                  <span className="truncate">{data.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs font-sans text-muted-foreground">
                <Flag className="w-3.5 h-3.5" />
                <span>{data.reportCount} reporte(s) recibido(s)</span>
              </div>
              {state === "suspended" && user.suspendedUntil && (
                <div className="flex items-center gap-2 text-xs font-sans text-amber-300">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Hasta {fmtDate(user.suspendedUntil)}</span>
                </div>
              )}
            </div>

            {(data.role || data.lookingFor) && (
              <div className="flex flex-wrap gap-2">
                {data.role && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-sans border border-border/50 bg-input/20 text-foreground">
                    {data.role}
                  </span>
                )}
                {data.lookingFor && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-sans border border-border/50 bg-input/20 text-foreground">
                    {data.lookingFor}
                  </span>
                )}
              </div>
            )}

            {data.bio && (
              <p className="font-sans text-sm text-muted-foreground">
                {data.bio}
              </p>
            )}

            {photos.length > 0 && (
              <div>
                <p className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Fotos del perfil
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      className="relative rounded-lg overflow-hidden border border-border/30"
                      style={{ aspectRatio: "1" }}
                    >
                      <img
                        src={p.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Acción de moderación
              </p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo (obligatorio para el aviso, opcional para el resto)…"
                className="rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans min-h-[60px] resize-none bg-input/40 text-sm"
                data-testid="input-user-reason"
              />
              <div className="grid grid-cols-2 gap-2 mt-3">
                {state !== "active" && (
                  <ActionButton
                    onClick={onRestore}
                    disabled={busy}
                    tone="green"
                    icon={<RotateCcw className="w-4 h-4" />}
                    testId="button-user-restore"
                  >
                    Restaurar
                  </ActionButton>
                )}
                <ActionButton
                  onClick={onWarn}
                  disabled={busy}
                  tone="amber"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  testId="button-user-warn"
                >
                  Enviar aviso
                </ActionButton>
                {state === "active" && (
                  <>
                    <ActionButton
                      onClick={() => onSuspend(7)}
                      disabled={busy}
                      tone="amber"
                      icon={<Clock className="w-4 h-4" />}
                      testId="button-user-suspend-7"
                    >
                      Suspender 7d
                    </ActionButton>
                    <ActionButton
                      onClick={() => onSuspend(30)}
                      disabled={busy}
                      tone="amber"
                      icon={<Clock className="w-4 h-4" />}
                      testId="button-user-suspend-30"
                    >
                      Suspender 30d
                    </ActionButton>
                  </>
                )}
                {state !== "banned" && state !== "removed" && (
                  <ActionButton
                    onClick={onBan}
                    disabled={busy}
                    tone="red"
                    icon={<Ban className="w-4 h-4" />}
                    testId="button-user-ban"
                  >
                    Banear
                  </ActionButton>
                )}
                {state !== "removed" && (
                  <ActionButton
                    onClick={onRemove}
                    disabled={busy}
                    tone="red"
                    icon={<Trash2 className="w-4 h-4" />}
                    testId="button-user-remove"
                  >
                    Eliminar
                  </ActionButton>
                )}
              </div>
            </div>

            <div>
              <p className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Historial de sanciones
              </p>
              {history.length === 0 ? (
                <p className="font-sans text-xs text-muted-foreground/70">
                  Sin sanciones registradas.
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="rounded-xl border border-border/40 p-3"
                      style={{ background: "rgba(255,255,255,0.02)" }}
                      data-testid={`history-item-${h.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans text-xs font-medium text-foreground">
                          {ACTION_LABELS[h.action] ?? h.action}
                          {h.durationDays ? ` · ${h.durationDays}d` : ""}
                        </span>
                        <span className="font-sans text-[11px] text-muted-foreground">
                          {fmtDate(h.createdAt)}
                        </span>
                      </div>
                      {h.reason && (
                        <p className="font-sans text-xs text-muted-foreground mt-1">
                          {h.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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

// --- Support tickets -------------------------------------------------------

const TICKET_STATUS_META: Record<
  SupportTicketStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pendiente",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  answered: {
    label: "Respondido",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  closed: {
    label: "Cerrado",
    className: "bg-white/5 text-muted-foreground border-border/40",
  },
  urgent: {
    label: "Urgente",
    className: "bg-red-500/15 text-red-300 border-red-500/40",
  },
};

function TicketStatusChip({ status }: { status: SupportTicketStatus }) {
  const meta = TICKET_STATUS_META[status] ?? TICKET_STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function SupportTab() {
  const { session } = useAuth();
  const [status, setStatus] = useState<"" | SupportTicketStatus>("");
  const [page, setPage] = useState(0);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  React.useEffect(() => {
    setPage(0);
  }, [status]);

  const PAGE_SIZE = 30;
  const params: ListAdminTicketsParams = {
    ...(status ? { status: status as ListAdminTicketsParams["status"] } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, isFetching } = useListAdminTickets(params, {
    query: {
      enabled: !!session,
      queryKey: getListAdminTicketsQueryKey(params),
      placeholderData: (prev) => prev,
      refetchInterval: 20_000,
    },
  });

  const tickets = data?.tickets ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = (page + 1) * PAGE_SIZE < total;

  return (
    <div className="px-4 pt-4 space-y-4">
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="w-full h-11 rounded-xl font-display tracking-wide text-white flex items-center justify-center gap-2"
        style={{
          background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
        }}
        data-testid="button-admin-start-ticket"
      >
        <Plus className="w-4 h-4" />
        Iniciar conversación
      </button>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip
          active={status === ""}
          onClick={() => setStatus("")}
          testId="chip-ticket-all"
        >
          Todos
        </Chip>
        {(["pending", "urgent", "answered", "closed"] as const).map((s) => (
          <Chip
            key={s}
            active={status === s}
            onClick={() => setStatus(s)}
            testId={`chip-ticket-${s}`}
          >
            {TICKET_STATUS_META[s].label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="w-7 h-7" />}
          title="Sin tickets"
          subtitle="No hay tickets de soporte que coincidan con el filtro."
        />
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <AdminTicketRow
              key={t.id}
              ticket={t}
              onClick={() => setSelectedTicketId(t.id)}
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!canPrev || isFetching}
            className="h-10 px-4 rounded-xl border border-border/50 font-sans text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 flex items-center gap-2"
            data-testid="button-tickets-prev"
          >
            Anterior
          </button>
          <span className="font-sans text-xs text-muted-foreground inline-flex items-center gap-2">
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Página {page + 1} de {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!canNext || isFetching}
            className="h-10 px-4 rounded-xl border border-border/50 font-sans text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40 flex items-center gap-2"
            data-testid="button-tickets-next"
          >
            Siguiente
          </button>
        </div>
      )}

      <AdminTicketThread
        ticketId={selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      />
      <AdminCreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          setSelectedTicketId(id);
        }}
      />
    </div>
  );
}

function TicketAvatar({
  username,
  avatarUrl,
  size = 40,
}: {
  username?: string | null;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initial = (username ?? "?").charAt(0).toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username ?? ""}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-display text-foreground"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, hsl(273,40%,30%), hsl(330,40%,30%))",
      }}
    >
      {initial}
    </div>
  );
}

function AdminTicketRow({
  ticket,
  onClick,
}: {
  ticket: SupportTicket;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 text-left hover:bg-white/5 transition-colors"
      style={{ background: "rgba(13,11,26,0.7)" }}
      data-testid={`admin-ticket-row-${ticket.id}`}
    >
      <TicketAvatar username={ticket.username} avatarUrl={ticket.avatarUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-sans text-sm font-medium text-foreground truncate">
            {ticket.username ?? "Usuario"}
          </p>
          {ticket.unread && (
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
          )}
        </div>
        <p className="font-sans text-xs text-foreground/80 truncate">
          {ticket.subject}
        </p>
        {ticket.lastMessagePreview && (
          <p className="font-sans text-[11px] text-muted-foreground truncate mt-0.5">
            {ticket.lastSenderRole === "admin" ? "Soporte: " : ""}
            {ticket.lastMessagePreview}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <TicketStatusChip status={ticket.status} />
        <span className="font-sans text-[10px] text-muted-foreground">
          {fmtDate(ticket.lastMessageAt)}
        </span>
      </div>
    </button>
  );
}

function AdminTicketThread({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const { data, isLoading } = useGetSupportTicket(ticketId ?? "", {
    query: {
      enabled: !!session && !!ticketId,
      queryKey: getGetSupportTicketQueryKey(ticketId ?? ""),
      refetchInterval: ticketId ? 5000 : false,
    },
  });

  const sendMessage = useSendSupportMessage();
  const setStatus = useSetAdminTicketStatus();

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  React.useEffect(() => {
    setReply("");
  }, [ticketId]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  React.useEffect(() => {
    if (!ticketId) return;
    // Reading a thread marks it read for the admin role server-side.
    qc.invalidateQueries({ queryKey: getGetNotificationsSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
  }, [qc, ticketId, messages.length]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
    qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getGetNotificationsSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
    if (ticketId) {
      qc.invalidateQueries({
        queryKey: getGetSupportTicketQueryKey(ticketId),
      });
    }
  };

  const submitReply = () => {
    if (!ticketId) return;
    const body = reply.trim();
    if (body.length < 1) return;
    sendMessage.mutate(
      { id: ticketId, data: { body } },
      {
        onSuccess: () => {
          setReply("");
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo enviar",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  const changeStatus = (next: SetTicketStatusRequestStatus) => {
    if (!ticketId) return;
    setStatus.mutate(
      { id: ticketId, data: { status: next } },
      {
        onSuccess: () => {
          toast({ title: "Estado actualizado" });
          invalidate();
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo cambiar el estado",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  const busy = sendMessage.isPending || setStatus.isPending;

  return (
    <Dialog open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col max-h-[85dvh]">
        <DialogHeader className="px-4 py-3 border-b border-border/40">
          <DialogTitle className="font-display tracking-wide flex items-center gap-2 text-left">
            <TicketAvatar
              username={ticket?.username}
              avatarUrl={ticket?.avatarUrl}
              size={32}
            />
            <span className="flex-1 min-w-0">
              <span className="block truncate">{ticket?.username ?? "Ticket"}</span>
              <span className="block font-sans text-xs text-muted-foreground font-normal truncate">
                {ticket?.subject ?? ""}
              </span>
            </span>
            {ticket && <TicketStatusChip status={ticket.status} />}
          </DialogTitle>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[180px]"
          data-testid="admin-ticket-messages"
        >
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.senderRole === "admin";
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[80%]">
                    <div
                      className={`px-3 py-2 rounded-2xl font-sans text-sm whitespace-pre-wrap break-words ${
                        mine
                          ? "text-white rounded-br-sm"
                          : "text-foreground rounded-bl-sm border border-border/40"
                      }`}
                      style={
                        mine
                          ? {
                              background:
                                "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                            }
                          : { background: "rgba(255,255,255,0.04)" }
                      }
                    >
                      {m.body}
                    </div>
                    <p
                      className={`font-sans text-[10px] text-muted-foreground mt-1 px-1 ${
                        mine ? "text-right" : "text-left"
                      }`}
                    >
                      {mine ? "Soporte · " : ""}
                      {fmtDate(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-border/40 flex gap-2 overflow-x-auto no-scrollbar">
          {ticket?.status !== "closed" && (
            <button
              type="button"
              onClick={() => changeStatus("closed")}
              disabled={busy}
              className="px-3 py-1.5 rounded-full font-sans text-xs whitespace-nowrap border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40"
              data-testid="button-ticket-close"
            >
              Cerrar
            </button>
          )}
          {ticket?.status !== "urgent" && (
            <button
              type="button"
              onClick={() => changeStatus("urgent")}
              disabled={busy}
              className="px-3 py-1.5 rounded-full font-sans text-xs whitespace-nowrap border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              data-testid="button-ticket-urgent"
            >
              Marcar urgente
            </button>
          )}
          {ticket?.status === "closed" && (
            <button
              type="button"
              onClick={() => changeStatus("pending")}
              disabled={busy}
              className="px-3 py-1.5 rounded-full font-sans text-xs whitespace-nowrap border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40"
              data-testid="button-ticket-reopen"
            >
              Reabrir
            </button>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border/40 flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={5000}
            rows={1}
            placeholder="Escribe una respuesta…"
            className="resize-none min-h-[44px] max-h-32"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitReply();
              }
            }}
            data-testid="input-admin-ticket-reply"
          />
          <button
            type="button"
            onClick={submitReply}
            disabled={busy || reply.trim().length < 1}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl text-white disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
            }}
            data-testid="button-admin-send-reply"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminCreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<AdminUserItem | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const create = useAdminCreateTicket();

  React.useEffect(() => {
    if (open) {
      setSearch("");
      setDebounced("");
      setSelected(null);
      setSubject("");
      setMessage("");
    }
  }, [open]);

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const params: ListAdminUsersParams = {
    ...(debounced ? { q: debounced } : {}),
    limit: 8,
    offset: 0,
  };
  const { data: userData, isFetching } = useListAdminUsers(params, {
    query: {
      enabled: !!session && open && !selected && debounced.length > 0,
      queryKey: getListAdminUsersQueryKey(params),
    },
  });
  const candidates = userData?.users ?? [];

  const submit = () => {
    if (!selected) return;
    const s = subject.trim();
    const m = message.trim();
    if (s.length < 1 || m.length < 1) {
      toast({
        title: "Completa el asunto y el mensaje",
        variant: "destructive",
      });
      return;
    }
    create.mutate(
      { data: { userId: selected.id, subject: s, message: m } },
      {
        onSuccess: (detail) => {
          qc.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
          qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
          onCreated(detail.ticket.id);
        },
        onError: (err: any) =>
          toast({
            title: "No se pudo crear el ticket",
            description: errMsg(err, "Inténtalo de nuevo."),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Iniciar conversación
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuario por nombre o ciudad…"
                className="pl-9 rounded-xl border border-border/60 font-sans bg-input/40 text-sm"
                data-testid="input-admin-ticket-user-search"
              />
            </div>
            {isFetching ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
            ) : debounced && candidates.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground text-center py-6">
                Sin resultados.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {candidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelected(u)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/40 text-left hover:bg-white/5"
                    style={{ background: "rgba(13,11,26,0.6)" }}
                    data-testid={`admin-ticket-user-${u.id}`}
                  >
                    <TicketAvatar
                      username={u.username}
                      avatarUrl={u.avatarUrl}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-sans text-sm text-foreground truncate">
                        {u.username ?? "Usuario"}
                      </p>
                      <p className="font-sans text-xs text-muted-foreground truncate">
                        {[u.city, PLAN_LABELS[u.plan as "free" | "plus" | "gold"]]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-primary/30 bg-primary/5">
              <TicketAvatar
                username={selected.username}
                avatarUrl={selected.avatarUrl}
                size={36}
              />
              <div className="flex-1 min-w-0">
                <p className="font-sans text-sm text-foreground truncate">
                  {selected.username ?? "Usuario"}
                </p>
                <p className="font-sans text-xs text-muted-foreground truncate">
                  {selected.city ?? ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="font-sans text-xs text-primary hover:underline"
                data-testid="button-admin-ticket-change-user"
              >
                Cambiar
              </button>
            </div>
            <div>
              <label className="font-sans text-xs text-muted-foreground mb-1 block">
                Asunto
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="Asunto del mensaje"
                data-testid="input-admin-ticket-subject"
              />
            </div>
            <div>
              <label className="font-sans text-xs text-muted-foreground mb-1 block">
                Mensaje
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
                rows={5}
                placeholder="Escribe el mensaje para el usuario…"
                data-testid="input-admin-ticket-body"
              />
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={create.isPending}
              className="w-full h-11 rounded-xl font-display tracking-wide text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              }}
              data-testid="button-admin-create-ticket"
            >
              <Send className="w-4 h-4" />
              {create.isPending ? "Creando…" : "Enviar"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

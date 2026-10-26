"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type Measurement = {
  id: string;
  recordedAt: string;
  weight: number | null;
  bodyFat: number | null;
  neck: number | null;
  chest: number | null;
  waist: number | null;
  abdomen: number | null;
  hips: number | null;
  armLeft: number | null;
  armRight: number | null;
  thighLeft: number | null;
  thighRight: number | null;
  calfLeft: number | null;
  calfRight: number | null;
  notes: string;
};

export type Goals = {
  targetWeight: number | null;
  targetWaist: number | null;
};

type MetricKey = keyof Pick<
  Measurement,
  "weight" | "bodyFat" | "waist" | "abdomen" | "hips" | "chest"
>;

const metrics: Record<MetricKey, { label: string; unit: string }> = {
  waist: { label: "Cintura", unit: "cm" },
  abdomen: { label: "Abdomen", unit: "cm" },
  weight: { label: "Peso", unit: "kg" },
  bodyFat: { label: "Grasa", unit: "%" },
  hips: { label: "Cadera", unit: "cm" },
  chest: { label: "Pecho", unit: "cm" },
};

const measurementFields = [
  { name: "weight", label: "Peso", unit: "kg", group: "base" },
  { name: "bodyFat", label: "% de grasa", unit: "%", group: "base" },
  { name: "neck", label: "Cuello", unit: "cm", group: "torso" },
  { name: "chest", label: "Pecho", unit: "cm", group: "torso" },
  { name: "waist", label: "Cintura", unit: "cm", group: "torso" },
  { name: "abdomen", label: "Abdomen", unit: "cm", group: "torso" },
  { name: "hips", label: "Cadera", unit: "cm", group: "torso" },
  { name: "armLeft", label: "Brazo izq.", unit: "cm", group: "extremities" },
  { name: "armRight", label: "Brazo der.", unit: "cm", group: "extremities" },
  { name: "thighLeft", label: "Muslo izq.", unit: "cm", group: "extremities" },
  { name: "thighRight", label: "Muslo der.", unit: "cm", group: "extremities" },
  { name: "calfLeft", label: "Pantorrilla izq.", unit: "cm", group: "extremities" },
  { name: "calfRight", label: "Pantorrilla der.", unit: "cm", group: "extremities" },
] as const;

function today() {
  return new Date().toLocaleDateString("en-CA");
}

function formatDate(value: string, short = false) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function display(value: number | null | undefined, unit: string) {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)} ${unit}`;
}

function average(a: number | null, b: number | null) {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return Math.round(((a + b) / 2) * 10) / 10;
}

function changeLabel(first: number | null, last: number | null, unit: string) {
  if (first === null || last === null || first === last) return "Sin cambio aún";
  const change = Math.round((last - first) * 10) / 10;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)} ${unit} desde el inicio`;
}

export type TrackerDataProvider = {
  load: () => Promise<{ measurements: Measurement[]; goals: Goals | null }>;
  saveMeasurement: (values: Record<string, FormDataEntryValue>) => Promise<void>;
  saveGoals: (values: Record<string, FormDataEntryValue>) => Promise<Goals>;
  removeMeasurement: (id: string) => Promise<void>;
};

type TrackerAppProps = {
  dataProvider?: TrackerDataProvider;
  userEmail?: string;
  onSignOut?: () => Promise<void> | void;
};

export default function TrackerApp({ dataProvider, userEmail, onSignOut }: TrackerAppProps = {}) {
  const [records, setRecords] = useState<Measurement[]>([]);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [metric, setMetric] = useState<MetricKey>("waist");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  async function loadData() {
    try {
      if (dataProvider) {
        const payload = await dataProvider.load();
        setRecords(payload.measurements ?? []);
        setGoals(payload.goals ?? null);
        return;
      }
      const response = await fetch("/api/progress", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos cargar tus datos.");
      setRecords(payload.measurements ?? []);
      setGoals(payload.goals ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos conectar con la nube.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  async function installApp() {
    if (installPrompt) {
      await (installPrompt as Event & { prompt: () => Promise<void> }).prompt();
      setInstallPrompt(null);
      return;
    }
    setMessage("En iPhone: toca Compartir y después “Agregar a pantalla de inicio”.");
  }

  async function saveMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(data.entries());
    try {
      if (dataProvider) {
        await dataProvider.saveMeasurement(body);
        setModalOpen(false);
        setMessage("Medición guardada y sincronizada.");
        await loadData();
        return;
      }
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos guardar.");
      setModalOpen(false);
      setMessage("Medición guardada y sincronizada.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function saveGoals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (dataProvider) {
        const savedGoals = await dataProvider.saveGoals(body);
        setGoals(savedGoals);
        setGoalOpen(false);
        setMessage("Objetivos actualizados.");
        return;
      }
      const response = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos guardar tus objetivos.");
      setGoals(payload.goals);
      setGoalOpen(false);
      setMessage("Objetivos actualizados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos guardar tus objetivos.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(id: string) {
    if (!window.confirm("¿Eliminar esta medición? Esta acción no se puede deshacer.")) return;
    if (dataProvider) {
      try {
        await dataProvider.removeMeasurement(id);
        setRecords((current) => current.filter((record) => record.id !== id));
        setMessage("Medición eliminada.");
      } catch {
        setMessage("No pudimos eliminar la medición.");
      }
      return;
    }
    const response = await fetch(`/api/progress?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setRecords((current) => current.filter((record) => record.id !== id));
      setMessage("Medición eliminada.");
    } else {
      setMessage("No pudimos eliminar la medición.");
    }
  }

  const latest = records.at(-1);
  const first = records[0];
  const chartData = useMemo(
    () => records.filter((record) => record[metric] !== null).slice(-10),
    [records, metric],
  );
  const chartValues = chartData.map((record) => record[metric] as number);
  const chartMin = Math.min(...chartValues, 0);
  const chartMax = Math.max(...chartValues, 1);

  const goalProgress = useMemo(() => {
    if (!first?.waist || !latest?.waist || !goals?.targetWaist) return null;
    const total = Math.abs(first.waist - goals.targetWaist);
    const completed = Math.abs(first.waist - latest.waist);
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  }, [first, latest, goals]);

  const statCards = [
    {
      label: "Cintura",
      value: display(latest?.waist, "cm"),
      trend: changeLabel(first?.waist ?? null, latest?.waist ?? null, "cm"),
      tone: "lime",
    },
    {
      label: "Abdomen",
      value: display(latest?.abdomen, "cm"),
      trend: changeLabel(first?.abdomen ?? null, latest?.abdomen ?? null, "cm"),
      tone: "coral",
    },
    {
      label: "Peso",
      value: display(latest?.weight, "kg"),
      trend: changeLabel(first?.weight ?? null, latest?.weight ?? null, "kg"),
      tone: "cream",
    },
    {
      label: "Brazo promedio",
      value: display(latest ? average(latest.armLeft, latest.armRight) : null, "cm"),
      trend: "Comparación bilateral",
      tone: "blue",
    },
  ];

  return (
    <div className="app-shell site-container">
      <aside className="sidebar">
        <a href="#inicio" className="brand" aria-label="Métrica, inicio">
          <img className="brand-logo" src="/favicon.svg" alt="Logo de Métrica" />
          <span>MÉTRICA</span>
        </a>
        <nav aria-label="Navegación principal">
          <a className="nav-link active" href="#inicio"><span>⌂</span> Resumen</a>
          <a className="nav-link" href="#progreso"><span>↗</span> Progreso</a>
          <a className="nav-link" href="#historial"><span>≡</span> Historial</a>
          <button className="nav-link" onClick={() => setGoalOpen(true)}><span>◎</span> Objetivos</button>
        </nav>
        <div className="coach-note">
          <span className="coach-dot">C</span>
          <p><strong>Consejo de coach</strong>Mídete por la mañana, antes de comer y siempre en condiciones similares.</p>
        </div>
        <button className="install-button" onClick={installApp}>＋ Instalar en mi celular</button>
      </aside>

      <main id="inicio" className="main-content">
        <div className="topbar site-header" role="banner">
          <a href="#inicio" className="mobile-brand"><img className="brand-logo" src="/favicon.svg" alt="Logo de Métrica" /><span>MÉTRICA</span></a>
          <div className="sync-pill"><span /> Guardado en la nube</div>
          {onSignOut && <button className="signout-button" onClick={onSignOut}>Cerrar sesión</button>}
          <button className="avatar" aria-label="Perfil y objetivos" title={userEmail} onClick={() => setGoalOpen(true)}>{userEmail ? userEmail.slice(0, 2).toUpperCase() : "YO"}</button>
        </div>

        {message && (
          <button className="toast" onClick={() => setMessage("")} aria-label="Cerrar mensaje">{message}<span>×</span></button>
        )}

        <section className="hero">
          <div>
            <span className="eyebrow">TU PROGRESO, EN CLARO</span>
            <h1>Lo que mides,<br /><em>lo puedes mejorar.</em></h1>
            <p>Registra tus medidas con constancia y descubre los cambios que la báscula no siempre muestra.</p>
          </div>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => setModalOpen(true)}>＋ Nueva medición</button>
            <span>Último registro<br /><strong>{latest ? formatDate(latest.recordedAt) : "Aún no hay datos"}</strong></span>
          </div>
        </section>

        {loading ? (
          <section className="loading-card" aria-live="polite">Sincronizando tu progreso…</section>
        ) : records.length === 0 ? (
          <section className="empty-state">
            <span className="empty-number">01</span>
            <div><span className="eyebrow">PRIMER PASO</span><h2>Crea tu punto de partida</h2><p>Tu primera medición será la referencia para celebrar cada avance. No necesitas llenar todo: comienza con cintura, abdomen y peso.</p></div>
            <button className="dark-button" onClick={() => setModalOpen(true)}>Registrar mi base →</button>
          </section>
        ) : (
          <>
            <section className="stats-grid" aria-label="Últimas medidas">
              {statCards.map((card) => (
                <article className={`stat-card ${card.tone}`} key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.trend}</small>
                </article>
              ))}
            </section>

            <section id="progreso" className="progress-layout">
              <article className="panel chart-panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">TENDENCIA</span><h2>Tu cambio en el tiempo</h2></div>
                  <select value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)} aria-label="Medida de la gráfica">
                    {Object.entries(metrics).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}
                  </select>
                </div>
                <div className="bar-chart" aria-label={`Gráfica de ${metrics[metric].label}`}>
                  {chartData.map((record) => {
                    const value = record[metric] as number;
                    const height = chartMax === chartMin ? 60 : 22 + ((value - chartMin) / (chartMax - chartMin)) * 72;
                    return (
                      <div className="bar-column" key={record.id}>
                        <span className="bar-value">{value}</span>
                        <div className="bar-track"><span style={{ height: `${height}%` }} /></div>
                        <small>{formatDate(record.recordedAt, true)}</small>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="panel goal-panel">
                <div className="goal-orbit"><span>{goalProgress ?? "—"}{goalProgress !== null && "%"}</span></div>
                <span className="eyebrow">OBJETIVO PRINCIPAL</span>
                <h2>{goals?.targetWaist ? `${goals.targetWaist} cm de cintura` : "Define tu próxima meta"}</h2>
                <p>{goalProgress !== null ? "Vas construyendo resultados. La tendencia importa más que un solo día." : "Una meta concreta convierte tus registros en una ruta."}</p>
                <button className="text-button" onClick={() => setGoalOpen(true)}>{goals ? "Editar objetivo" : "Crear objetivo"} →</button>
              </article>
            </section>

            <section id="historial" className="history-section">
              <div className="section-heading"><div><span className="eyebrow">BITÁCORA</span><h2>Historial reciente</h2></div><span>{records.length} {records.length === 1 ? "registro" : "registros"}</span></div>
              <div className="history-list">
                {[...records].reverse().slice(0, 8).map((record, index) => (
                  <article className="history-row" key={record.id}>
                    <div className="history-date"><strong>{String(records.length - index).padStart(2, "0")}</strong><span>{formatDate(record.recordedAt)}</span></div>
                    <div className="history-measures">
                      <span><small>Cintura</small>{display(record.waist, "cm")}</span>
                      <span><small>Abdomen</small>{display(record.abdomen, "cm")}</span>
                      <span><small>Peso</small>{display(record.weight, "kg")}</span>
                    </div>
                    <p>{record.notes || "Sin notas"}</p>
                    <button className="delete-button" onClick={() => removeRecord(record.id)} aria-label={`Eliminar registro del ${formatDate(record.recordedAt)}`}>×</button>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="method-card">
          <div><span className="eyebrow">MIDE MEJOR</span><h2>La regla de oro: mismas condiciones.</h2></div>
          <ol>
            <li><span>1</span>Por la mañana y antes de desayunar.</li>
            <li><span>2</span>Cinta paralela al piso, sin apretar.</li>
            <li><span>3</span>Cada 1–2 semanas; evita obsesionarte con el día a día.</li>
          </ol>
          <p>Esta app ayuda a registrar tendencias y no sustituye la valoración de un profesional de la salud.</p>
        </section>

        <section className="video-card" aria-labelledby="video-title">
          <div>
            <span className="eyebrow">RECURSO EN STREAMING</span>
            <h2 id="video-title">Aprende a medir correctamente tu cintura</h2>
            <p>Consulta esta guía en video de MD Anderson Cancer Center para mejorar la consistencia de tus registros.</p>
          </div>
          <a href="https://www.youtube.com/watch?v=t4LYqIxWHQQ" target="_blank" rel="noreferrer">Ver video en YouTube ↗</a>
        </section>

        <footer className="site-footer">
          <div className="footer-brand"><img className="brand-logo" src="/favicon.svg" alt="Logo de Métrica" /><strong>MÉTRICA</strong></div>
          <div><span>Curso</span><strong>Conceptualización de servicios en la nube</strong></div>
          <div><span>Estudiante</span><strong>Ana Luisa Martínez Rentería</strong></div>
          <div><span>Código</span><strong>224791068</strong></div>
          <div><span>Contacto</span><a href="mailto:anylu.mr10@gmail.com">anylu.mr10@gmail.com</a></div>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        <a href="#inicio"><span>⌂</span>Inicio</a>
        <a href="#progreso"><span>↗</span>Progreso</a>
        <button className="mobile-add" onClick={() => setModalOpen(true)} aria-label="Nueva medición">＋</button>
        <a href="#historial"><span>≡</span>Historial</a>
        <button onClick={() => setGoalOpen(true)}><span>◎</span>Meta</button>
      </nav>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setModalOpen(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="measurement-title">
            <div className="modal-heading"><div><span className="eyebrow">NUEVO CHECK-IN</span><h2 id="measurement-title">Registra cómo vas</h2><p>Completa solo las medidas que tomaste hoy.</p></div><button onClick={() => setModalOpen(false)} aria-label="Cerrar">×</button></div>
            <form onSubmit={saveMeasurement}>
              <label className="date-field">Fecha de medición<input type="date" name="recordedAt" defaultValue={today()} required /></label>
              <fieldset><legend>Composición</legend><div className="fields-grid">{measurementFields.filter((field) => field.group === "base").map((field) => <MeasureField key={field.name} {...field} />)}</div></fieldset>
              <fieldset><legend>Torso</legend><div className="fields-grid">{measurementFields.filter((field) => field.group === "torso").map((field) => <MeasureField key={field.name} {...field} />)}</div></fieldset>
              <fieldset><legend>Brazos y piernas</legend><div className="fields-grid">{measurementFields.filter((field) => field.group === "extremities").map((field) => <MeasureField key={field.name} {...field} />)}</div></fieldset>
              <label className="notes-field">Notas<textarea name="notes" rows={3} maxLength={500} placeholder="Ej. Semana de descarga, dormí mejor, más energía…" /></label>
              <div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar en la nube"}</button></div>
            </form>
          </section>
        </div>
      )}

      {goalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setGoalOpen(false)}>
          <section className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="goal-title">
            <div className="modal-heading"><div><span className="eyebrow">TU NORTE</span><h2 id="goal-title">Define tus objetivos</h2><p>Úsalos como guía, no como juicio.</p></div><button onClick={() => setGoalOpen(false)} aria-label="Cerrar">×</button></div>
            <form onSubmit={saveGoals}>
              <div className="fields-grid">
                <MeasureField name="targetWaist" label="Cintura objetivo" unit="cm" defaultValue={goals?.targetWaist} />
                <MeasureField name="targetWeight" label="Peso objetivo" unit="kg" defaultValue={goals?.targetWeight} />
              </div>
              <div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setGoalOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar objetivos"}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function MeasureField({ name, label, unit, defaultValue }: { name: string; label: string; unit: string; group?: string; defaultValue?: number | null }) {
  return (
    <label className="measure-field"><span>{label}</span><div><input type="number" name={name} step="0.1" min="0" max="500" inputMode="decimal" defaultValue={defaultValue ?? ""} placeholder="0.0" /><small>{unit}</small></div></label>
  );
}

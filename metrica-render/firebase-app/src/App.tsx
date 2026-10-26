import { FormEvent, useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import TrackerApp, {
  type Goals,
  type Measurement,
  type TrackerDataProvider,
} from "../../app/TrackerApp";
import { auth, db } from "./firebase";

function authErrorMessage(error: unknown, action: "login" | "reset") {
  const code = error instanceof FirebaseError ? error.code : "unknown";

  if (code === "auth/network-request-failed") {
    return "No pudimos conectar con Firebase. Revisa tu internet e inténtalo otra vez.";
  }
  if (code === "auth/too-many-requests") {
    return "Firebase bloqueó temporalmente los intentos por seguridad. Espera unos minutos y vuelve a intentar.";
  }
  if (code === "auth/user-disabled") {
    return "Esta cuenta está deshabilitada en Firebase.";
  }
  if (code === "auth/operation-not-allowed") {
    return "El acceso con correo y contraseña no está habilitado en Firebase.";
  }
  if (code === "auth/api-key-not-valid.-please-pass-a-valid-api-key.") {
    return "La conexión de la app con Firebase no es válida. Actualiza la página para cargar la versión nueva.";
  }
  if (action === "login" && (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")) {
    return "Firebase rechazó ese correo o contraseña. Pulsa “Olvidé mi contraseña” para crear una nueva.";
  }
  if (action === "reset" && code === "auth/invalid-email") {
    return "La dirección de correo no tiene un formato válido.";
  }

  return action === "login"
    ? `No pudimos iniciar sesión (error: ${code}).`
    : `No pudimos enviar el correo (error: ${code}).`;
}

const numericFields = [
  "weight",
  "bodyFat",
  "neck",
  "chest",
  "waist",
  "abdomen",
  "hips",
  "armLeft",
  "armRight",
  "thighLeft",
  "thighRight",
  "calfLeft",
  "calfRight",
] as const;

function parseOptionalNumber(value: FormDataEntryValue | undefined, max = 500) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new Error("Revisa las medidas: hay un valor fuera de rango.");
  }
  return Math.round(parsed * 10) / 10;
}

function createProvider(user: User): TrackerDataProvider {
  const userRoot = doc(db, "users", user.uid);
  const measurementsCollection = collection(userRoot, "measurements");
  const goalsDocument = doc(userRoot, "settings", "goals");

  return {
    async load() {
      const [recordsSnapshot, goalsSnapshot] = await Promise.all([
        getDocs(query(measurementsCollection, orderBy("recordedAt", "asc"))),
        getDoc(goalsDocument),
      ]);

      const measurements = recordsSnapshot.docs.map((record) => ({
        id: record.id,
        ...(record.data() as Omit<Measurement, "id">),
      }));
      const goals = goalsSnapshot.exists()
        ? (goalsSnapshot.data() as Goals)
        : null;
      return { measurements, goals };
    },

    async saveMeasurement(values) {
      const recordedAt = typeof values.recordedAt === "string" ? values.recordedAt : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
        throw new Error("Selecciona una fecha válida.");
      }

      const measurement: Record<string, unknown> = {
        recordedAt,
        notes: typeof values.notes === "string" ? values.notes.trim().slice(0, 500) : "",
        createdAt: serverTimestamp(),
      };
      let supplied = 0;
      for (const field of numericFields) {
        const parsed = parseOptionalNumber(values[field], field === "bodyFat" ? 80 : 500);
        measurement[field] = parsed;
        if (parsed !== null) supplied += 1;
      }
      if (!supplied) throw new Error("Agrega al menos una medición.");

      await addDoc(measurementsCollection, measurement);
    },

    async saveGoals(values) {
      const goals: Goals = {
        targetWaist: parseOptionalNumber(values.targetWaist),
        targetWeight: parseOptionalNumber(values.targetWeight),
      };
      await setDoc(goalsDocument, { ...goals, updatedAt: serverTimestamp() }, { merge: true });
      return goals;
    },

    async removeMeasurement(id) {
      await deleteDoc(doc(measurementsCollection, id));
    },
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authWarning, setAuthWarning] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setAuthWarning("Firebase tardó demasiado en responder. Puedes intentar entrar; si falla, revisa tu conexión.");
      setAuthReady(true);
    }, 8000);

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        window.clearTimeout(timeout);
        setUser(nextUser);
        setAuthReady(true);
      },
      (error) => {
        window.clearTimeout(timeout);
        setAuthWarning(authErrorMessage(error, "login"));
        setAuthReady(true);
      },
    );

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const provider = useMemo(() => user ? createProvider(user) : null, [user]);

  if (!authReady) return <div className="auth-loading">Preparando tu espacio privado…</div>;
  if (!user || !provider) return <Login initialMessage={authWarning} />;

  return (
    <TrackerApp
      dataProvider={provider}
      userEmail={user.email ?? undefined}
      onSignOut={() => signOut(auth)}
    />
  );
}

function Login({ initialMessage = "" }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setMessage(authErrorMessage(error, "login"));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMessage("Escribe tu correo para enviarte el enlace de recuperación.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Te enviamos un enlace para cambiar tu contraseña.");
    } catch (error) {
      setMessage(authErrorMessage(error, "reset"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <a className="auth-brand" href="/" aria-label="Métrica, inicio"><span className="brand-mark">M</span><span>MÉTRICA</span></a>
        <div>
          <span className="eyebrow">TU PROGRESO, EN CLARO</span>
          <h1>Lo que mides,<br /><em>lo puedes mejorar.</em></h1>
          <p>Un espacio privado para registrar tus medidas, entender tendencias y reconocer el trabajo que haces cada semana.</p>
        </div>
        <div className="auth-privacy"><span>✓</span><p><strong>Tus datos son tuyos.</strong>Cada cuenta solo puede ver y modificar sus propias mediciones.</p></div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">BIENVENIDA</span>
          <h2>Entra a tu cuenta</h2>
          <p>Usa el correo y la contraseña que registraste en Firebase.</p>
          <form onSubmit={submit}>
            <label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="tu@correo.com" /></label>
            <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="••••••••" /></label>
            {message && <div className="auth-message" role="status">{message}</div>}
            <button className="auth-submit" disabled={busy}>{busy ? "Entrando…" : "Entrar a Métrica →"}</button>
          </form>
          <button className="auth-reset" type="button" onClick={resetPassword} disabled={busy}>Olvidé mi contraseña</button>
        </div>
        <p className="auth-disclaimer">Métrica ayuda a registrar tendencias y no sustituye una evaluación médica o nutricional.</p>
      </section>
    </main>
  );
}

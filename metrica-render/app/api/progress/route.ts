import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { goals, measurements } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type MeasurementInput = Partial<typeof measurements.$inferInsert>;

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

async function currentUserId() {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  if (process.env.NODE_ENV !== "production") return "local-preview-user";
  return null;
}

function parseNumber(value: unknown, min: number, max: number) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? Math.round(number * 10) / 10
    : undefined;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  try {
    const db = getDb();
    const [rows, goalRows] = await Promise.all([
      db
        .select()
        .from(measurements)
        .where(eq(measurements.userId, userId))
        .orderBy(asc(measurements.recordedAt), asc(measurements.createdAt))
        .limit(200),
      db.select().from(goals).where(eq(goals.userId, userId)).limit(1),
    ]);
    return Response.json({ measurements: rows, goals: goalRows[0] ?? null });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No pudimos cargar tus datos." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const recordedAt = typeof body.recordedAt === "string" ? body.recordedAt : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
      return Response.json({ error: "Selecciona una fecha válida." }, { status: 400 });
    }

    const values: MeasurementInput = {
      id: crypto.randomUUID(),
      userId,
      recordedAt,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "",
    };

    let supplied = 0;
    for (const field of numericFields) {
      const max = field === "bodyFat" ? 80 : field === "weight" ? 500 : 300;
      const parsed = parseNumber(body[field], 0, max);
      if (parsed === undefined) {
        return Response.json({ error: `El valor de ${field} está fuera de rango.` }, { status: 400 });
      }
      values[field] = parsed;
      if (parsed !== null) supplied += 1;
    }

    if (!supplied) {
      return Response.json({ error: "Agrega al menos una medición." }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db.insert(measurements).values(values as typeof measurements.$inferInsert).returning();
    return Response.json({ measurement: row }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No pudimos guardar la medición." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el registro." }, { status: 400 });

  const db = getDb();
  await db
    .delete(measurements)
    .where(and(eq(measurements.id, id), eq(measurements.userId, userId)));
  return Response.json({ ok: true });
}

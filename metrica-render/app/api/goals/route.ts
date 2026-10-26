import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { goals } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

async function currentUserId() {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  if (process.env.NODE_ENV !== "production") return "local-preview-user";
  return null;
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 500
    ? Math.round(parsed * 10) / 10
    : undefined;
}

export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const targetWeight = optionalNumber(body.targetWeight);
  const targetWaist = optionalNumber(body.targetWaist);
  if (targetWeight === undefined || targetWaist === undefined) {
    return Response.json({ error: "Revisa tus objetivos." }, { status: 400 });
  }

  const db = getDb();
  await db
    .insert(goals)
    .values({ userId, targetWeight, targetWaist, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: goals.userId,
      set: { targetWeight, targetWaist, updatedAt: new Date().toISOString() },
    });
  const [row] = await db.select().from(goals).where(eq(goals.userId, userId)).limit(1);
  return Response.json({ goals: row });
}

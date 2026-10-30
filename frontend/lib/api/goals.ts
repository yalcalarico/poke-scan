import type { CollectionGoalDto } from "@/types/api";
import { ApiError, apiFetch } from "./api-client";

function goalsPath(collectionId: string): string {
  return `/collections/${encodeURIComponent(collectionId)}/goals`;
}

function readGoal(value: unknown, collectionId: string): CollectionGoalDto {
  if (typeof value !== "object" || value === null) throw unreadable();
  const goal = value as Record<string, unknown>;
  if (
    typeof goal.id !== "string" ||
    !goal.id ||
    goal.collectionId !== collectionId ||
    typeof goal.title !== "string" ||
    goal.title.trim() !== goal.title ||
    Array.from(goal.title).length < 1 ||
    Array.from(goal.title).length > 120 ||
    typeof goal.isNext !== "boolean" ||
    typeof goal.createdAt !== "string" ||
    !Number.isFinite(Date.parse(goal.createdAt)) ||
    typeof goal.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(goal.updatedAt))
  )
    throw unreadable();
  return {
    id: goal.id,
    collectionId,
    title: goal.title,
    isNext: goal.isNext,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

const unreadable = () => new ApiError(502, "No pudimos leer los objetivos");

export async function listGoals(
  collectionId: string,
  signal?: AbortSignal,
): Promise<CollectionGoalDto[]> {
  const raw = await apiFetch<unknown>(goalsPath(collectionId), {
    signal,
    cache: "no-store",
  });
  if (!Array.isArray(raw)) throw unreadable();
  const goals = raw.map((goal: unknown) => readGoal(goal, collectionId));
  if (
    new Set(goals.map((goal) => goal.id)).size !== goals.length ||
    goals.filter((goal) => goal.isNext).length > 1
  )
    throw unreadable();
  return goals;
}

export async function createGoal(
  collectionId: string,
  title: string,
): Promise<CollectionGoalDto> {
  return readGoal(
    await apiFetch<unknown>(goalsPath(collectionId), {
      method: "POST",
      body: { title },
    }),
    collectionId,
  );
}

export async function updateGoal(
  collectionId: string,
  goalId: string,
  title: string,
): Promise<CollectionGoalDto> {
  return readGoal(
    await apiFetch<unknown>(
      `${goalsPath(collectionId)}/${encodeURIComponent(goalId)}`,
      { method: "PATCH", body: { title } },
    ),
    collectionId,
  );
}

export async function setNextGoal(
  collectionId: string,
  goalId: string,
): Promise<CollectionGoalDto> {
  return readGoal(
    await apiFetch<unknown>(
      `${goalsPath(collectionId)}/${encodeURIComponent(goalId)}/next`,
      { method: "PATCH" },
    ),
    collectionId,
  );
}

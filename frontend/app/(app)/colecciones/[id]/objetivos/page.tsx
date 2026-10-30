import type { Metadata } from "next";
import { GoalsScreen } from "@/components/goals/goals-screen";

export const metadata: Metadata = {
  title: "Objetivos de colección",
  description: "Creá tus objetivos y elegí qué sigue para tu colección.",
  robots: { index: false, follow: false },
};

export default async function GoalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GoalsScreen key={id} collectionId={id} />;
}

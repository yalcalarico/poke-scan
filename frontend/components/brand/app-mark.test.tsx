// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppMark } from "./app-mark";
import { BottomNav } from "@/components/layout/bottom-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/inicio" }));

describe("Marca Viñeta", () => {
  it("usa la P de referencia, decorativa y con el tamaño solicitado", () => {
    const view = render(<AppMark size={36} className="test-mark" />);
    expect(screen.getByText("P")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("P")).toHaveStyle({ width: "36px", height: "36px" });
    expect(screen.getByText("P")).toHaveClass("test-mark");
    expect(view.container.querySelector("img")).toBeNull();
  });
  it("conserva el destino y nombre accesible de la marca con el wordmark elegido", () => {
    render(<BottomNav />);
    const brand = screen.getByRole("link", { name: "PokéScan, inicio de la app" });
    expect(brand).toHaveAttribute("href", "/inicio");
    expect(brand).toHaveTextContent("POKÉSCAN");
    expect(brand.querySelector("[data-brand-wordmark]")).not.toBeNull();
  });
});

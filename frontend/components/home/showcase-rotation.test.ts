import { describe, it, expect } from "vitest";
import { rotateShowcase } from "./showcase-rotation";
describe("Rotación de la vitrina", () => {
  it("muestra hasta tres y gira sin alterar el pool", () => {
    const pool = ["a", "b", "c", "d"];
    expect(rotateShowcase(pool, 0)).toEqual(["a", "b", "c"]);
    expect(rotateShowcase(pool, 1)).toEqual(["b", "c", "d"]);
    expect(rotateShowcase(pool, 3)).toEqual(["d", "a", "b"]);
    expect(pool).toEqual(["a", "b", "c", "d"]);
  });
  it("respeta selecciones vacías, de una o dos cartas", () => {
    expect(rotateShowcase([], 3)).toEqual([]);
    expect(rotateShowcase(["a"], 9)).toEqual(["a"]);
    expect(rotateShowcase(["a", "b"], 1)).toEqual(["b", "a"]);
  });
});

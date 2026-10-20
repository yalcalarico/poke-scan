# Revisión local de los 33 sets pendientes

15/10/2026, Argentina. Revisión de catálogos previamente descargados; sin nuevas consultas al proveedor ni cambios de mappings, colas o precios. Los candidatos de esta tabla no acreditan todavía identidad de cartas ni cobertura de precios.

## Hallazgos

- 24 candidatos uno a uno con diferencias de nombres/prefijos; requieren corroboración de números, edición e idioma antes de activarse.
- 4 sets McDonald’s (2016, 2017, 2018 y 2021) están marcados como suplementarios: el descubrimiento actual los excluye expresamente. No quitar el guard global.
- 4 mitades de Trainer Kit comparten 2 grupos externos. La regla uno a uno no permite registrarlas sin diseñar particiones y validar identidades de cartas.
- Futsal no tiene un grupo dedicado evidente en el catálogo guardado; no asociarlo por similitud.

| Set local | Candidato externo | Tratamiento |
|---|---|---|
| basep — Wizards Black Star Promos | 1418 — WoTC Promo | candidato por nombre; falta corroborar cartas |
| bp — Best of Game | 1455 — Best of Promos | candidato por nombre; falta corroborar cartas |
| bwp — BW Black Star Promos | 1407 — Black and White Promos | candidato por nombre; falta corroborar cartas |
| dpp — DP Black Star Promos | 1421 — Diamond and Pearl Promos | candidato por nombre; falta corroborar cartas |
| fut20 — Pokémon Futsal Collection | — | sin candidato dedicado |
| hgss2 — HS—Unleashed | 1399 — Unleashed | candidato por nombre; falta corroborar cartas |
| hgss3 — HS—Undaunted | 1403 — Undaunted | candidato por nombre; falta corroborar cartas |
| hgss4 — HS—Triumphant | 1381 — Triumphant | candidato por nombre; falta corroborar cartas |
| hsp — HGSS Black Star Promos | 1453 — HGSS Promos | candidato por nombre; falta corroborar cartas |
| mcd11 — McDonald's Collection 2011 | 1401 — McDonald's Promos 2011 | candidato por nombre; falta corroborar cartas |
| mcd12 — McDonald's Collection 2012 | 1427 — McDonald's Promos 2012 | candidato por nombre; falta corroborar cartas |
| mcd14 — McDonald's Collection 2014 | 1692 — McDonald's Promos 2014 | candidato por nombre; falta corroborar cartas |
| mcd15 — McDonald's Collection 2015 | 1694 — McDonald's Promos 2015 | candidato por nombre; falta corroborar cartas |
| mcd16 — McDonald's Collection 2016 | 3087 — McDonald's Promos 2016 | suplementario excluido |
| mcd17 — McDonald's Collection 2017 | 2148 — McDonald's Promos 2017 | suplementario excluido |
| mcd18 — McDonald's Collection 2018 | 2364 — McDonald's Promos 2018 | suplementario excluido |
| mcd19 — McDonald's Collection 2019 | 2555 — McDonald's Promos 2019 | candidato por nombre; falta corroborar cartas |
| mcd21 — McDonald's Collection 2021 | 2782 — McDonald's 25th Anniversary Promos | suplementario excluido |
| mcd22 — McDonald's Collection 2022 | 3150 — McDonald's Promos 2022 | candidato por nombre; falta corroborar cartas |
| np — Nintendo Black Star Promos | 1423 — Nintendo Promos | candidato por nombre; falta corroborar cartas |
| ru1 — Pokémon Rumble | 1433 — Rumble | candidato por nombre; falta corroborar cartas |
| sma — Hidden Fates Shiny Vault | 2594 — Hidden Fates: Shiny Vault | candidato por nombre; falta corroborar cartas |
| smp — SM Black Star Promos | 1861 — SM Promos | candidato por nombre; falta corroborar cartas |
| sve — Scarlet & Violet Energies | 24382 — SVE: Scarlet & Violet Energies | candidato por nombre; falta corroborar cartas |
| svp — Scarlet & Violet Black Star Promos | 22872 — SV: Scarlet & Violet Promo Cards | candidato por nombre; falta corroborar cartas |
| swsh12pt5gg — Crown Zenith Galarian Gallery | 17689 — SWSH: Crown Zenith: Galarian Gallery | candidato por nombre; falta corroborar cartas |
| swsh45sv — Shining Fates Shiny Vault | 2781 — Shining Fates: Shiny Vault | candidato por nombre; falta corroborar cartas |
| swshp — SWSH Black Star Promos | 2545 — SWSH: Sword & Shield Promo Cards | candidato por nombre; falta corroborar cartas |
| tk1a — EX Trainer Kit Latias | 1543 — EX Trainer Kit 1: Latias & Latios | partición necesaria |
| tk1b — EX Trainer Kit Latios | 1543 — EX Trainer Kit 1: Latias & Latios | partición necesaria |
| tk2a — EX Trainer Kit 2 Plusle | 1542 — EX Trainer Kit 2: Plusle & Minun | partición necesaria |
| tk2b — EX Trainer Kit 2 Minun | 1542 — EX Trainer Kit 2: Plusle & Minun | partición necesaria |
| xyp — XY Black Star Promos | 1451 — XY Promos | candidato por nombre; falta corroborar cartas |

## Próximo paso técnico

Corroborar los 24 candidatos simples con productos ya disponibles localmente; proponer aliases acotados, sin normalización amplia que mezcle promos, años o subconjuntos. Los suplementarios y kits deben tener aceptación separada. Serializar cualquier implementación y validación con la ejecución de precios; no detener la descarga para esta revisión documental.

Fuentes locales: catálogo local de sets y catálogo de 220 grupos usados por la validación previa de crons (13/10). No se consultó vigencia externa en esta revisión.

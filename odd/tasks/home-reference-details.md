# Home — logo y paneles de referencia
Ajuste posterior a la aprobación humana de Home; base `0fe328c2ff2908321930c0ee18b58d0b5ebaf405`, rama `fix/home-design-fidelity`, PR #24 abierto contra master.
Entrega: continuar el PR de Home, sin issue ni merge. Tres unidades independientes con código, tests y guía propios; forecast 650–950 líneas authored, single-pr por alcance humano por pantalla. No modificar backend, proveedores ni dependencias.

## Specs

- **S1** — “[Image#1] el logo este me gusto prefiero que sea asi en mi app”. Referencia: letra P blanca en cuadrado rojo inclinado con borde de tinta y wordmark POKÉSCAN en negrita/cursiva, como `design/vitrina-variantes/03-vitrina-comic.html`. Marca visible compartida, sin rediseñar pantallas ni cambiar manifest/íconos instalados en este ajuste de cabecera.
- **S2** — “[Image#2] aca falta en mi app que este exacatamente igual, que diga USD, y me permita cambiar a ARS tambien”. Panel de valor con encabezado pequeño uppercase, control de moneda en extremo derecho, cifra/guion grande positivo, texto real, recuadro de advertencia y disclosure “Cómo se calcula”. Reutilizar CurrencyProvider/useCurrency y Money, sin una segunda conversión. ARS sólo con cotización existente; sin cotización indicar indisponibilidad, no inventar precio o tipo de cambio ni habilitar flags.
- **S3** — “[Image#3] la parte de objetivo falta tambien que quede exactamente igual.” Composición del artboard: título, badge, colección, marca de objetivo inclinada, texto, descripción, acciones “Usar sugerencia”, “Generar otra” y “Ver objetivos”, nota inferior. Reutilizar sugerencias editoriales y GoalEditor; usar sugerencia abre editor sin persistir hasta confirmar. Si hay próximo objetivo, mostrar el real y permitir editarlo; sin progreso ficticio. No copiar DEMO ni inventar objetivo guardado: badge Sugerencia/Objetivo real según estado.
- **S4** — “esta mejor, ya lo revise, esta ok, tengo par de cosita”. Preservar el Home aprobado fuera de estos ajustes: abanico, galería, datos reales, rutas, pausa, reduced-motion y estados de sesión. Sin cambios a CollectionGoalPanel consumido en otras pantallas, CurrencyProvider, GoalEditor ni contratos backend. Capturas comparativas sólo Home/referencia, locales ignoradas; autorización previa vigente, sin videos/traces ni imágenes remotas.

## Tasks

- **D1** [S1-S4] — Implementar los tres detalles. Ruta: parent inline tras dos workers disjuntos fallidos (ambos assistant reported an error, sin relanzar); reconciliación de parciales y pruebas observadas por parent. Estado: done — parent observó focal36/36 y tsc0; marca y paneles implementados. Commit: `d6c2cbf` marca, `b5169ae` valor, `160ccfb` objetivo, cada uno con pruebas/guía. Allowed surfaces de cada writer derivadas por parent, sin solaparse; parent integra mocks/guías comunes al volver.
- **D2** [S1-S4] — Validar integración, comparación Home/referencia claro/oscuro móvil/escritorio, USD/ARS/cotización ausente, sugerencia/editor/guardado real aislado, pnpm run check y evaluación nativa por candidato. Ruta: parent; verificador independiente sólo si aparece Risk item concreto. Estado: done — job6 navegador5/5 y pnpmruncheck completo0; capturasfinales revisadas. Revisión nativa aprobada y consumida; APIs del navegador sintéticas explícitas. Commit: `d6c2cbf`, `b5169ae`, `160ccfb`. No repetir suites intactas ni afirmar fidelidad por tests jsdom.
- **D3** [S1-S4] — Registrar evidencia, commits revisables y actualizar PR24 sin issue/merge; informar diferencias/límites y checks remotos. Ruta: parent. Estado: in_progress — tres commits funcionales creados y validados; falta subir y actualizar PR24. Commit: cierre de feature.

## Log

**L1 — Pedido original (verbatim)**

esta mejor, ya lo revise, esta ok, tengo par de cosita
[Image#1] el logo este me gusto prefiero que sea asi en mi app
[Image#2] aca falta en mi app que este exacatamente igual, que diga USD, y me permita cambiar a ARS tambien
[Image#3] la parte de objetivo falta tambien que quede exactamente igual.

Adjuntos humanos: logo P rojo + POKÉSCAN; panel Valor de referencia/USD con guion, texto demo y recuadro/disclosure; panel próximo objetivo con DEMO y sugerencia editorial. Se conserva geometría pero no datos falsos ni afirmaciones de maqueta en producto.

**L2 — Evidencia inicial y ruta**

Git limpio en fix/home-design-fidelity, PR24OPEN, head0fe328c contra master, no merge. Marcaactual usaPNG azuly wordmarknoitálico en nav; valor carece de selector y disclosure; HomeGoalPanel sólo muestra objetivo/vacío y selector externo, sin composición/acciones sugeridas. CurrencyProvider ya ofrece currency/setCurrency/isAvailable, conversión y persistencia existentes; GoalsScreen ya tiene sugerencias y GoalEditor (create/update sólo al confirmar). Workers no modifican esos helpers compartidos. Pruebas RED deben reproducir cada pedido por interfaz pública antes de implementación.

**L3 — Runtime antes de tests**

Se ejecutó pnpmrunstop después de listar puertos: había nodePIDs60433(web3000)/60516(api3001). Se verificó usuario pero no cwd/comando antes de stop: no se afirma ownership de esos procesos. Incidente de procedimiento del parent; comprobar identidad antes de cualquier nueva intervención y no reiniciar procesos históricos por inferencia. No se abrieron .env ni secretos.


**L4 — Continuación explícita y parciales reconciliados**

Usuario (verbatim): “sigue”. Workers mvvibkhh-2-xr5p (valor) y mvvibki1-3-z4ut (objetivo) fallaron, pero dejaron8archivos parciales; no hay evidencia completa de sus checks ni RED anterior a sus writes. Parent conservó parciales, leyó superficie y continúainline; no se relanzan. ASSESSpostdelegado medium/reviewDuefalse; sinverificador independiente exigido. Padre corrigió estilos de título (normalvalor/título caseobjetivo),padding/radio objetivo y agregómarca P/wordmark compartido. REDlogo2/2 observado antesdeimplementar. RED retrospectivoenbase0fe328c de las nuevas pruebaspaneles:13fallidas/6previasverdes; no se presenta comoredprewrite delworker. Candidatofocal36/36 en5archivos y tsc0 observados porparent. D1siguein_progress: falta validaciónvisual/integración yregistrofinal. Puertos3000/3001/3100ahora libres; no se reactivan procesos históricos.


**L5 — Integración preparada**

D1done con36/36focal y tsc0. D2 usa harnesslocal ignorado details/ derivado del runnerautorizado:4comparaciones Home/referencia claro/oscuro móvil/escritorio + visitanteARSausente; mutacionesUI sólofixtureaislada. Verifica tipografíacomputada, monedaUSD↔ARS, guionpreservado,disclosure,generar/abrir/cancelarsinPOST y unPOSTexplícitoalguardar. No se presenta laAPIsintética como DBreal. Colecciones/GoalEditor/moneda de backend no cambiados; gatecompleto incluye pruebas HTTP/persistencia existentes del backend, sin alterar contratos. Risk:none para estos cambios solicitados; la marca compartida cambia sólo la identidad visual expresamente pedida, no opciones/parsers/helpers ni destinos.


**L6 — Gate y revisión concluidos**

Job6exit0:5/5navegador(4comparaciones +visitanteARSsinrate) y pnpmruncheck completoverde;36focal y tsc0 previos. ParentrevisóPNGfinaldesktopclaro/móviloscuro y referencias. Computados:valorh2 11pxnormal, objetivotítulocasenotransform; marca P/POKÉSCAN presente. AccionesUSD↔ARS,guionpreservado,disclosure, generar/abrir/cancelarsinPOST,guardarunPOST yreleer pasan enAPIsintética local. No equivale a datos económicos reales ni aceptación de cámara/FPS. Rootcheck cubrecontratos ypersistenciabackend existentes; no se modificaron backend/proveedores. Warnings de lintpreexistentesbackend y advertenciatracingrootdelrunner, sinerrores. Revisiónnativareview-745d98ecf440b41a deltarget1830fa... en3lentes aprobada y acknowledge-approvedcompletado, authorityburned; ASSESSconsumedtrue/reviewDuefalse/already_reviewed. Clasificador nativehighporrutaauth-shell: sólo cambiomarca visible, sinlógicaauth/guard; noitemriesgoconcreto quepidaindependentverifier. Sin findingsqueabran corrección.

**L7 — Commits por comportamiento**

`d6c2cbf` marca (78adiciones/61borrados); `b5169ae` valor(399/29); `160ccfb` objetivo(455/15). Conteo de~400esheurística: panelobjetivoincluye editor/estados/aislamiento/pruebas completo, no se recortan tests para encajar. D2done/D3in_progress hasta publicarestoscommits y evidencia enPR24. La marca cambió enauth/marketingporpedidoexplícitodelogoapp; no se rediseñan esas pantallas. Sin .env/secrets, nuevos iconoslauncher, vídeos/traces/capturastracked ni merge.

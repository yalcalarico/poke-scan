# Incidencia del gate BE-07: dos expectativas de persistencia

El primer check estándar falló en dos casos de organize-sheet, sin cambios de fuente (501 hashes coinciden). Focal2 y archivo24 recibidos pasaron aisladamente; no se toman como resolución del global.

La fuente separa llamada del mock de su resolución: saveGroup persiste saving antes de await addItem, confirma/persiste después de la respuesta; el error incierto se persiste por efecto tras cambiar estado. La expectativa del primer caso miraba storage después de un texto DOM, sin esperar storage. La del segundo miraba allocations después de callcount, antes de esperar respuesta y persistencia.

Root autorizó únicamente el test recibido, preservado con hash/diff. Para probar causalidad se agregó sólo una respuesta controlada al segundo caso, conservando la expectativa original prematura: falló determinísticamente con allocations2+1 frente al esperado1 (frontend-causal-premature.log), igual que el check inicial. La promesa seguía pendiente y no hubo confirmación. Luego el test final exige saving/ambas partes/ningún éxito antes de resolver, resuelve una respuesta válida y espera las mismas allocations originales finales, operaciónconfirmed y toast Guardamos2copias. El primer caso espera statusuncertain persistido.

No se cambiaron valores esperados, timeout, flags, skips, implementación, storage ni API. Corrió el archivo entero con24pruebas verdes. La corrección justifica una nueva ejecución estándar; el fallo original permanece histórico y no se reemplaza.

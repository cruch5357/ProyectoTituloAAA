# Biblioteca y editor de bloques

## Uso

1. Iniciar sesión como coach y entrar a **Bloques** en el menú.
2. Crear una carpeta si se desea. Pulsar **Crear bloque**, ingresar un nombre y elegir semanas con − / + (inicialmente seis). La carpeta es opcional.
3. Añadir días a cada semana. El máximo es siete, incluyendo duplicaciones.
4. Añadir un ejercicio desde el catálogo. Seleccionar su base y modificadores, o crearlos desde la búsqueda indicando su categoría. Los modificadores seleccionados pueden quitarse y cambiar de orden.
5. Añadir series y editar peso, repeticiones y RPE. Los campos pueden quedar vacíos. La prioridad cambia entre verde, amarillo y rojo al pulsar el indicador; tiene etiqueta accesible.
6. La flecha curva copia los valores y la prioridad de la serie anterior. Los puntos permiten arrastrar series/ejercicios; las flechas ofrecen una alternativa para teclado y pantallas táctiles.
7. Añadir notas, duplicar ejercicios/días/semanas y ordenar. Duplicar una semana aumenta explícitamente la cantidad de semanas.
8. Pulsar **Guardar bloque** antes de salir. El editor informa cambios pendientes, bloquea la navegación accidental y conserva la edición si falla el servidor. En móvil se trabaja con una semana a la vez.
9. Volver a abrir el bloque y comprobar los datos. Desde la biblioteca se puede renombrar, mover de carpeta, quitar la carpeta, duplicar o eliminar con confirmación.
10. Abrir la copia y modificarla: el original conserva sus datos.

## Arquitectura y persistencia

- Se extendió la jerarquía existente de Prisma: `Block → Week → Session → SessionExercise`. No hay un segundo árbol de entrenamiento en JSON ni datos de ejecución mezclados.
- Un bloque antiguo sigue perteneciendo a `Program`. Un bloque independiente pertenece directamente a un coach (`Block.coachId`, `programId = null`). Un CHECK de PostgreSQL impide tener ambos propietarios o ninguno. Las pantallas y APIs de programas anteriores siguen funcionando y no permiten modificar estos bloques independientes.
- `BlockFolder` organiza la biblioteca por coach. `ExerciseModifier` mantiene el catálogo de modificadores. Los ejercicios base reutilizan `Exercise`.
- `SessionExercise.modifiers` guarda una instantánea estructurada y ordenada de los modificadores seleccionados. Su nombre visible se calcula en una única función. Editar las series nunca modifica el catálogo.
- `ProgrammedSet` conserva identidad, orden, peso, reps, RPE y prioridad semántica (`low`, `medium`, `high`). Está separado de `SetLog`.
- `weekCount` se deriva de las semanas; no se mantiene un contador redundante.
- React usa TanStack Query para datos remotos y un borrador local para el editor. Los inputs de series se incorporan al borrador al salir del campo, sin escribir al servidor por tecla. El submit también incorpora el campo activo cuando se usa Enter.
- `PATCH /block-library/:id` guarda el árbol completo en una transacción. Solo permite bloques independientes: reemplaza los descendientes conservando sus IDs y normaliza el orden desde las posiciones de los arrays. No toca asignaciones, registros ni programas antiguos. Cualquier fallo revierte toda la operación.
- Un bloqueo de fila y `revision` evitan que una pestaña sobrescriba una versión más reciente (HTTP 409). No hay fusión automática de ediciones concurrentes.
- La duplicación omite todas las identidades del árbol y Prisma genera nuevas. Las referencias al catálogo sí se conservan.

## Validaciones

Nombres sin espacios vacíos, carpeta y ejercicios propios, IDs únicos en el árbol, al menos una semana, máximo siete días (UI, DTO y trigger SQL), peso no negativo con dos decimales, reps enteras, RPE entre 0 y 10 y prioridad cerrada de tres valores. Las nuevas opciones del catálogo se deduplican ignorando mayúsculas y espacios. El guardado y las acciones remotas muestran errores y bloquean envíos simultáneos.

La migración `20261021010000_block_library` es aditiva, ya aplicada en la base local durante el desarrollo. En otros entornos ejecutar `npm run prisma:migrate:deploy --prefix backend` y regenerar Prisma. No requiere convertir los programas existentes.

## Archivos principales

- `backend/prisma/schema.prisma` y `backend/prisma/migrations/20261021010000_block_library/migration.sql`.
- `backend/src/blocks/library.controller.ts`, `library.service.ts`, `library.dto.ts`, `library-tree.ts`.
- `frontend/src/pages/blocks/LibraryPage.tsx`, `LibraryEditorPage.tsx`, `ExercisePicker.tsx`, `ExerciseEditor.tsx`, `library-model.ts`, `library.css`.
- `frontend/src/api/blockLibrary.ts`; rutas y menú del coach.

## Verificación automatizada

- `backend/src/blocks/library.spec.ts`: validación anidada, nombres/semanas, RPE, límite de días, IDs repetidos y duplicación.
- `frontend/src/pages/blocks/library-model.test.ts`: copia profunda independiente, orden, copia de valores, campos opcionales y estructura serializable.
- `tests/browser/block-library.spec.ts`: Chromium contra backend y PostgreSQL reales. Crea un coach exclusivo y elimina únicamente sus fixtures al terminar. Cubre el recorrido de seis semanas, series, prioridades, drag and drop, notas, siete días, guardado/recarga, copia independiente, móvil, autorización, conflicto de revisión y trigger SQL.

Comandos:

```powershell
npm test --prefix backend -- --runInBand
npm test --prefix frontend -- --maxWorkers=2
npm run test:e2e:browser -- block-library.spec.ts
npm run lint
npm run build
```

Esta entrega no incorpora asignación a alumnos, fechas, calendario ni ejecución de estos bloques. Los flujos anteriores del proyecto permanecen separados.

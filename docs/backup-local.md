# Backup y restore local

## Alcance y requisitos

`npm run backup:local` respalda el schema public de DATABASE_URL con pg_dump (formato custom) y todo CHAT_STORAGE_DIR (por defecto backend/storage/chat). Carga backend/.env; las variables del proceso tienen precedencia. No incluye roles globales, otros schemas, .env ni configuración SMTP/JWT. El destino requiere un rol propietario con permisos DDL. Solo admite host localhost/127.0.0.1/::1.

Instalar las herramientas PostgreSQL de versión compatible con el servidor (verificado con 18). Si no están en PATH, en PowerShell:

```powershell
$env:PG_BIN = 'C:\Program Files\PostgreSQL\18\bin'
```

El script falla claramente si pg_dump/pg_restore no están disponibles. No imprime DATABASE_URL/passwords ni los pasa en argumentos de conexión. Los backups no están cifrados: almacenarlos en disco protegido y no compartirlos públicamente.

## Crear backup

1. Detener el backend y cualquier otro escritor de BD/multimedia. pg_dump es consistente para BD, pero la copia del filesystem no comparte su transacción.
2. Ejecutar `npm run backup:local` desde la raíz.
3. Comprobar la estructura y el mensaje final:

```text
backups/<timestamp-UTC>/
  database.dump
  storage/
  manifest.json
```

El timestamp ISO usa UTC para evitar ambigüedad. Una carpeta sin manifest.json es un backup incompleto y no debe restaurarse. Si no hay multimedia, storage existe vacío. El script rechaza enlaces simbólicos en el árbol multimedia y rutas superpuestas de storage/backups. Git ignora backups/ y backend/storage/; no borrar originales hasta verificar una restauración.

## Restaurar explícitamente

**Modifica la base y los archivos de destino.** Detener la aplicación y hacer un backup del destino antes. Nunca se ejecuta al iniciar el software.

```powershell
npm run restore:local -- backups/<timestamp> --confirm
```

Sin --confirm, solo muestra la advertencia y termina. Comprueba manifest/dump/storage, valida el archivo mediante pg_restore --list, copia archivos a staging y restaura PostgreSQL con --single-transaction --clean --if-exists --exit-on-error. Los objetos incluidos en el dump sustituyen sus versiones de destino; no se garantiza purgar objetos ajenos que no aparecen en ese dump. Preferir una base vacía compatible.

Solo tras éxito de PostgreSQL se cambia la carpeta multimedia; la anterior se conserva como `<CHAT_STORAGE_DIR>.before-restore-<timestamp>`. El backend debe seguir detenido si ocurre un error. No hay transacción atómica entre PostgreSQL y filesystem: si falla el cambio de carpeta tras restaurar BD, conservar staging y la carpeta anterior, corregir permisos/espacio y completar la recuperación antes de abrir la app. Si falla pg_restore, revierte la transacción de BD; el staging puede inspeccionarse/eliminarse manualmente.

## Verificación segura en una base temporal

Crear una base vacía exclusiva (por ejemplo aaa_restore_check) con su rol local. En una terminal nueva, definir DATABASE_URL apuntando explícitamente a esa base y CHAT_STORAGE_DIR a `storage/restore-check`. Restaurar allí con --confirm, comprobar usuarios/workouts/sets y que los archivos correspondan al backup. No cambiar el .env de desarrollo ni restaurar sobre él para hacer esta prueba. Abrir la demo usando esa configuración si se desea comprobar descargas. Terminar la terminal elimina esos overrides.

La validación de esta iteración usó dos bases temporales: seed ejecutado dos veces, backup y restauración, con 4 usuarios, 18 workouts, 54 snapshots y 162 sets; un archivo multimedia sintético se recuperó con contenido idéntico. No se restauró la base de desarrollo. Los backups locales de prueba quedan ignorados y se documenta su ubicación en el reporte de validación.

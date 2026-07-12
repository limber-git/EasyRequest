# Informe de seguridad de EasyRequest

## Resumen ejecutivo

La revisión del Extension Host TypeScript y del webview React no deja hallazgos
críticos o altos abiertos. Se eliminaron dependencias remotas, se añadieron
límites de memoria, validación estricta y almacenamiento local de secretos. La
auditoría final de npm reporta cero vulnerabilidades conocidas.

## Hallazgos corregidos

### SEC-001 — Alto — consumo no acotado de memoria

- Ubicación: `src/services/HttpService.ts:39`,
  `src/services/ResponseReader.ts:7` y
  `src/services/discovery/SwaggerStrategy.ts:5`.
- Impacto previo: una respuesta o documento OpenAPI grande, multiplicado por
  una ráfaga, podía agotar la memoria del Extension Host.
- Corrección: lectura incremental con límite, cancelación del stream, techo de
  500 solicitudes, 20 workers y límite OpenAPI de 5 MiB.

### SEC-002 — Alto — script remoto y dependencias vulnerables

- Ubicación: `webview/src/components/RequestPanel.tsx` y
  `src/editors/EasyRequestEditorProvider.ts:378`.
- Impacto previo: Monaco intentaba cargar código desde un CDN que la CSP
  bloqueaba y añadía dependencias con avisos de seguridad.
- Corrección: editor de texto local con validación JSON, CSP autocontenida y
  eliminación de Monaco y del Webview UI Toolkit archivado.

### SEC-003 — Alto — documentos y mensajes no validados

- Ubicación: `src/services/DocumentCodec.ts:14`,
  `src/editors/EasyRequestEditorProvider.ts:309` y `webview/src/App.tsx:20`.
- Impacto previo: un archivo malformado podía convertirse silenciosamente en
  una colección predeterminada y posteriormente sobrescribirse.
- Corrección: validación estructural y de tamaño, pantalla de recuperación,
  control de revisiones, cola de mutaciones y flujo explícito de conflictos.

### SEC-004 — Medio — secretos guardados en colecciones

- Ubicación: `src/services/CollectionSecrets.ts:5` y
  `webview/src/components/EnvironmentEditor.tsx:30`.
- Impacto previo: tokens en variables de entorno se persistían en texto plano.
- Corrección: variables marcadas como secreto se guardan mediante VS Code
  `SecretStorage`; el JSON sólo conserva el nombre y un valor vacío.

### SEC-005 — Medio — entrada de red no restringida

- Ubicación: `src/services/HttpService.ts:118` y
  `src/services/discovery/SwaggerStrategy.ts:174`.
- Impacto previo: se aceptaban esquemas de URL inesperados y headers sin una
  validación previa clara.
- Corrección: sólo se permiten HTTP/HTTPS; se bloquean variables sin resolver,
  nombres de header inválidos y valores con CR/LF.

## Riesgos residuales documentados

- EasyRequest es un cliente HTTP y por diseño permite que el usuario envíe
  solicitudes a cualquier host HTTP/HTTPS. Ninguna solicitud se inicia sin una
  acción explícita del usuario.
- URLs, bodies y headers forman parte de `.erequest`. Las credenciales deben
  referenciar variables marcadas como secreto; esta limitación está explicada
  en `README.md`, `SECURITY.md` y `SUPPORT.md`.
- El descubrimiento C# es estático: lee archivos, pero no compila ni ejecuta
  código del espacio de trabajo.

## Verificación

- ESLint y typecheck: correctos.
- 15 pruebas automatizadas: correctas.
- `npm audit`: 0 vulnerabilidades.
- VSIX: 12 archivos, 78,5 KiB, sin fuentes, pruebas, `node_modules`, mapas ni
  colecciones locales.

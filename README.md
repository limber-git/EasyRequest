# EasyRequest

EasyRequest es un cliente HTTP para Visual Studio Code que abre colecciones
`.erequest` como una pestaña nativa del editor. Permite ejecutar solicitudes,
administrar variables por entorno, lanzar ráfagas concurrentes y descubrir
endpoints de APIs ASP.NET Core sin salir del espacio de trabajo.

## Características

- Constructor de solicitudes para `GET`, `POST`, `PUT`, `PATCH`, `DELETE`,
  `HEAD` y `OPTIONS`.
- Variables de entorno con sintaxis `{{nombreDeVariable}}` en URL, parámetros,
  headers y body.
- Ejecución desde el Extension Host de VS Code, por lo que el webview no queda
  sujeto a restricciones CORS.
- Ráfagas con cantidad y nivel de concurrencia configurables; cada intento
  muestra estado, duración, headers y respuesta.
- Sincronización desde documentos OpenAPI 3 / Swagger 2.
- Descubrimiento offline de controladores ASP.NET Core y Minimal APIs C#.
- Colecciones JSON versionables y compartibles mediante Git.

## Requisitos

- VS Code 1.85 o posterior.
- Node.js 18 o posterior para desarrollar la extensión.

## Desarrollo local

```bash
npm ci
npm run build
```

Después, abre el proyecto en VS Code y ejecuta la configuración **Run
EasyRequest** (`F5`). Se abrirá una ventana de Extension Development Host.

Para crear una colección, abre la paleta de comandos y ejecuta
**EasyRequest: Nueva colección**. También puedes abrir cualquier archivo con
extensión `.erequest`.

Durante el desarrollo, `npm run watch` recompila el host de la extensión y el
webview. `npm run lint` comprueba los tipos de ambos proyectos.

## Uso de colecciones

Cada colección es un JSON con versión explícita. Este es un ejemplo mínimo:

```json
{
  "version": 1,
  "selectedEnvironmentId": "local",
  "environments": [
    {
      "id": "local",
      "name": "Local",
      "variables": {
        "apiUrl": "https://localhost:7001",
        "userId": "42"
      }
    }
  ],
  "requests": [
    {
      "id": "get-user",
      "name": "Obtener usuario",
      "method": "GET",
      "url": "{{apiUrl}}/api/users/{{userId}}",
      "headers": [],
      "params": [],
      "body": "",
      "bodyType": "none"
    }
  ],
  "endpoints": []
}
```

Los cambios realizados en la interfaz se guardan directamente en el archivo.
Los valores de un entorno forman parte de dicho archivo, por lo que no debes
incluir tokens, contraseñas ni otros secretos en colecciones compartidas.

Para editar los valores, abre **Variables** junto al selector de entorno en la
esquina superior derecha. Por ejemplo, una petición con
`{{apiUrl}}/api/requests` usará el valor `http://localhost:5025` si esa es la
URL configurada para `apiUrl` en el entorno seleccionado.

## Variables y peticiones

EasyRequest sustituye únicamente tokens literales con la forma
`{{variable}}`; no evalúa código ni expresiones. Si una variable no existe, la
petición se envía conservando el token y la interfaz muestra una advertencia.

Las solicitudes se ejecutan en el proceso de la extensión. El timeout por
defecto es de 30 segundos y se puede ajustar en la configuración de VS Code.

## Ráfagas concurrentes

En el constructor de peticiones indica:

1. **Solicitudes**: cuántas veces se ejecutará la misma petición.
2. **En paralelo**: máximo de solicitudes activas al mismo tiempo.

El límite global de una ráfaga es 100 solicitudes por defecto. El panel de
respuesta permite abrir cada resultado individual y muestra el tiempo total de
la ejecución.

## Descubrimiento de endpoints

### OpenAPI / Swagger

Introduce la URL del documento, por ejemplo
`https://localhost:7001/swagger/v1/swagger.json`, y pulsa **Sincronizar**.
EasyRequest agrupa las operaciones por tag/controlador, conserva el verbo HTTP
y crea una petición inicial con parámetros y un body JSON. Si el documento no
incluye ejemplos, genera un body editable a partir del esquema, incluso cuando
este referencia `components/schemas` (OpenAPI 3) o `definitions` (Swagger 2).

Al sincronizar, EasyRequest detecta el origen del documento y lo guarda en la
variable `apiUrl` del entorno seleccionado. Las peticiones importadas quedan
con la forma `{{apiUrl}}/ruta`, de modo que el puerto se cambia una sola vez en
**Variables**. Por ejemplo, sincronizar
`http://localhost:5025/swagger/v1/swagger.json` configura
`apiUrl = http://localhost:5025`.

Si Swagger no está disponible, la sincronización intenta automáticamente el
análisis del espacio de trabajo C# y, como último recurso, conserva el último
mapa almacenado en la colección.

### ASP.NET Core offline

El botón **Analizar C#** busca hasta 500 archivos `.cs`, ignorando `bin` y
`obj`. Reconoce los patrones habituales:

- Controladores con `[Route]` y atributos `[HttpGet]`, `[HttpPost]`,
  `[HttpPut]`, `[HttpPatch]`, `[HttpDelete]`, `[HttpHead]` u `[HttpOptions]`.
- Rutas de acción declaradas en los atributos HTTP.
- Minimal APIs mediante `app.MapGet`, `MapPost`, `MapPut`, `MapPatch` y
  `MapDelete`.

Es un análisis estático deliberadamente conservador: no compila ni ejecuta el
proyecto y no intenta inferir rutas generadas dinámicamente, grupos de rutas o
atributos personalizados.

## Configuración

| Ajuste | Predeterminado | Descripción |
| --- | ---: | --- |
| `easyrequest.requestTimeoutMs` | `30000` | Tiempo máximo de una petición HTTP en milisegundos. |
| `easyrequest.maxBatchRequests` | `100` | Máximo de solicitudes que puede contener una ráfaga. |

## Estructura

```text
src/                         Extension Host (TypeScript)
  editors/                   Proveedor del Custom Editor
  services/                  HTTP, variables y descubrimiento
webview/src/                 Interfaz React/Vite
  components/                Paneles de colección, petición y respuesta
```

## Licencia

[MIT](LICENSE).

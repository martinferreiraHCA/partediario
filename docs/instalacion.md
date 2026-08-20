# Instalación

Hay dos partes: **la carpeta de Google Drive** (donde vive todo) y **la aplicación en GitHub Pages**
(la ventana para trabajar con ella). La configuración inicial se hace una sola vez.

---

## 1. Publicar la aplicación en GitHub Pages

1. Subí el repositorio a GitHub.
2. Entrá en **Settings → Pages**.
3. En *Source* elegí **GitHub Actions** (el repositorio ya trae `.github/workflows/pages.yml`).
   Si preferís *Deploy from a branch*, elegí la rama y la carpeta raíz (`/`).
4. En un par de minutos vas a tener la dirección pública, del estilo
   `https://<usuario>.github.io/<repositorio>/`.

Abriéndola ya podés recorrer todo en **modo demostración**, sin tocar Google.

---

## 2. Crear el backend en Google Drive

### 2.1 Crear el proyecto de Apps Script

1. Entrá a [script.google.com](https://script.google.com) con la cuenta de Google que va a ser
   **dueña del sistema** (idealmente una cuenta institucional, no personal).
2. **Nuevo proyecto** y ponele un nombre, por ejemplo `Gestión Educativa – Liceo N.º 5`.
3. Borrá el contenido de `Código.gs` y pegá el archivo [`apps-script/Codigo.gs`](../apps-script/Codigo.gs)
   de este repositorio.
4. Opcional: en **Configuración del proyecto** activá *Mostrar el archivo de manifiesto
   `appsscript.json`* y pegá el contenido de [`apps-script/appsscript.json`](../apps-script/appsscript.json).

### 2.2 Implementar como aplicación web

1. **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. *Ejecutar como*: **Yo** (tu cuenta será la dueña de la carpeta y de los archivos).
4. *Quién tiene acceso*: **Cualquier usuario**.
   Esto es necesario porque una página estática no puede autenticarse con la sesión de Google del
   navegador contra Apps Script. El control de acceso real lo hace el sistema: verifica la
   **cuenta de Google** de quien entra (ver paso 3) o, como alternativa, su **código de acceso**.
5. Copiá la **URL de la aplicación web** (termina en `/exec`).
6. La primera vez Google va a pedir autorización: aceptá los permisos de Drive, Hojas de cálculo,
   Formularios y disparadores.

### 2.3 Ejecutar la configuración inicial

Desde la aplicación:

1. Abrí la aplicación publicada → **Configuración**.
2. En *Conexión con Google Drive*:
   - Modo de trabajo: **Google Drive (Apps Script)**.
   - Pegá la URL `/exec`.
   - **Probar conexión** (tiene que responder «Conexión correcta»).
3. En *Configuración inicial en Drive*, escribí el nombre del liceo y presioná
   **Ejecutar configuración inicial**.

Se crea la carpeta con todo adentro:

```text
📁 Gestión Educativa – <Liceo>
   ├── 01 · Configuración    → planilla «Configuración» (General, Usuarios, Turnos, Años, Motivos)
   ├── 02 · Horarios         → planilla «Horarios» + carpeta «Originales»
   ├── 03 · Inasistencias    → formulario docente + planilla de avisos
   ├── 04 · Partes diarios   → planilla «Partes diarios» + un archivo por día (AAAA/MM)
   └── 05 · Exportaciones    → copias y respaldos
```

Al terminar, la pantalla muestra los enlaces a la carpeta, a la configuración, al formulario y a la
planilla de respuestas, y **tu código de acceso de administrador**. Guardalo: también queda en la
hoja «Usuarios».

> ¿Ya tenés una carpeta creada y querés usar esa? Pegá su **ID** en *Carpeta existente* antes de
> ejecutar la configuración inicial. El ID es la parte final de la URL de la carpeta en Drive.

También podés ejecutar la función `configuracionInicial()` directamente desde el editor de Apps Script.

---

## 3. Habilitar el ingreso con cuenta de Google

Con esto cada persona entra con su cuenta de Google en lugar de un código. El navegador obtiene un
**ID token** firmado por Google y el backend lo verifica y busca el correo en la hoja «Usuarios».

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) con la misma cuenta.
2. Elegí (o creá) un proyecto y andá a **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - Tipo **Interno** si el liceo usa Google Workspace y sólo van a entrar cuentas del dominio.
   - Tipo **Externo** si va a entrar alguna cuenta de otro dominio (por ejemplo un Gmail personal);
     en ese caso agregá esas cuentas como *usuarios de prueba* o publicá la aplicación.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - En **Orígenes autorizados de JavaScript** agregá exactamente el origen de tu GitHub Pages,
     por ejemplo `https://<usuario>.github.io` (sin la barra final ni la ruta del repositorio).
   - No hace falta configurar URI de redireccionamiento ni usar el secreto de cliente.
4. Copiá el **ID de cliente** (`…apps.googleusercontent.com`).
5. En la aplicación: **Configuración → Ingreso con cuenta de Google**, pegalo y **Guardar**.
   Queda registrado en la hoja «General» del archivo de configuración, dentro de la carpeta de Drive.

Desde ese momento la pantalla de acceso muestra el botón **Acceder con Google**. La sesión de Google
dura alrededor de una hora; cuando vence, la aplicación lo avisa y pide volver a entrar.

> El ingreso con código sigue disponible como alternativa (equipos compartidos de Adscripción,
> personas sin cuenta de Google) y como salida de emergencia si algo falla con OAuth.

## 4. Cargar usuarios y accesos

En **Configuración → Usuarios y accesos** (o directamente en la hoja «Usuarios» de la planilla de
configuración) agregá a cada persona con:

| Columna | Contenido |
| --- | --- |
| `id` | Identificador interno (se genera solo) |
| `nombre` | Nombre y apellido |
| `email` | Correo principal de Google con el que entra |
| `rol` | `admin`, `direccion`, `adscripcion`, `administrativo`, `psicologia`, `docente` o `lectura` |
| `codigo` | Código de acceso personal, alternativa a Google (se genera solo si se deja vacío) |
| `activo` | `sí` / `no` — permite dar de baja un acceso sin borrar la fila |
| `observaciones` | Texto libre |
| `emailsAdicionales` | **Otros correos de la misma persona**, separados por coma |

**Varios correos por persona.** Es habitual que alguien tenga la cuenta institucional y además una
personal, o que cambie de dominio. Poné el habitual en `email` y los demás en `emailsAdicionales`
(por ejemplo `maria.perez@gmail.com, mperez@liceo5.edu.uy`): con cualquiera de ellos entra al mismo
usuario, con el mismo rol y el mismo historial. Los correos no distinguen mayúsculas.

Cada persona abre la aplicación, ingresa la URL `/exec` y toca **Acceder con Google** (o usa su
código), y entra con los permisos de su rol. Si su cuenta no figura en la hoja, la aplicación se lo
dice con claridad y le indica que pida que agreguen ese correo.

> **Cuidado**: el código de acceso es una llave del sistema. Compartilo por un canal privado y
> cambialo (o desactivá la fila) cuando alguien deja el cargo. Si preferís que sólo se pueda entrar
> con cuenta de Google, dejá la columna `codigo` vacía.

---

## 5. Cargar el horario institucional

1. **Horarios institucionales → Subir horario** en el año que corresponda.
2. Formatos: **XLSX**, **ODS** o **CSV**, en cualquiera de estas dos disposiciones:
   - **Lista**: una fila por clase, con columnas *Día, Hora, Turno, Grupo, Materia, Docente, Salón*.
   - **Matriz**: la grilla de pared, con los grupos en la primera columna y las horas en la primera
     fila; cada celda puede decir `Materia / Docente`.
3. El asistente muestra una vista previa, avisa de filas incompletas y de superposiciones de docente
   antes de confirmar.
4. Marcá cuál es el **año activo**: es el que se usa para cruzar las inasistencias del día.

Los PDF no se interpretan automáticamente: un PDF describe cómo se ve la tabla, no su estructura.
Exportá el horario a planilla antes de subirlo.

---

## 6. Formulario para docentes

La configuración inicial crea el formulario **«Aviso de inasistencia docente»** dentro de
`03 · Inasistencias`, ya vinculado a la planilla de respuestas y con un disparador que copia cada
respuesta a la hoja «Inasistencias».

- Compartí con los docentes el enlace público del formulario.
- La URL queda guardada en *Configuración → Datos de la institución* y aparece como acceso directo
  en Inicio e Inasistencias.
- Pedile a los docentes que escriban su nombre **como figura en el horario institucional**. El cruce
  ignora acentos, mayúsculas, comas y el orden de las palabras (`López, María` = `maría lópez`),
  pero no adivina apodos.

---

## 7. Mantenimiento

- **Actualizar el backend**: pegá la nueva versión de `Codigo.gs` y creá una implementación nueva
  (o actualizá la existente). La URL `/exec` se mantiene si actualizás la misma implementación.
- **Respaldos**: *Configuración → Datos y respaldos* descarga un JSON con todo. La carpeta de Drive
  ya es en sí misma el respaldo vivo del sistema.
- **Cambio de año lectivo**: agregá el año nuevo, subí su horario y marcalo como activo. El año
  anterior queda archivado, con su horario intacto.

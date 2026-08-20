# Instalación

Hay dos partes: **la carpeta de Google Drive** (donde vive todo) y **la aplicación en GitHub Pages**
(la ventana para trabajar con ella). La configuración inicial se hace una sola vez.

Al sistema se entra **únicamente con cuenta de Google**, y sólo si ese correo figura en la hoja
«Usuarios» de la carpeta. No hay contraseñas ni códigos.

---

## 1. Publicar la aplicación en GitHub Pages

1. Subí el repositorio a GitHub.
2. Entrá en **Settings → Pages**.
3. En *Source* elegí **GitHub Actions** (el repositorio ya trae `.github/workflows/pages.yml`).
   Si preferís *Deploy from a branch*, elegí la rama y la carpeta raíz (`/`).
4. En un par de minutos vas a tener la dirección pública, del estilo
   `https://<usuario>.github.io/<repositorio>/`.

Abriéndola ya podés recorrer todo en **modo demostración**, que trabaja con datos de ejemplo
guardados en el navegador y no toca Google.

Anotá el **origen** de esa dirección (`https://<usuario>.github.io`, sin la barra final ni la ruta
del repositorio): lo vas a necesitar en el paso siguiente.

---

## 2. Crear el ID de cliente OAuth (ingreso con Google)

Es lo que permite que el navegador obtenga un **ID token** firmado por Google y que el backend
verifique quién está entrando.

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) con la cuenta que va a ser
   **dueña del sistema** (idealmente una cuenta institucional).
2. Elegí o creá un proyecto y andá a **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - **Interno** si el liceo usa Google Workspace y sólo van a entrar cuentas del dominio.
   - **Externo** si va a entrar alguna cuenta de otro dominio (por ejemplo un Gmail personal); en ese
     caso agregá esas cuentas como *usuarios de prueba* o publicá la aplicación.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - En **Orígenes autorizados de JavaScript** agregá exactamente el origen del paso 1,
     por ejemplo `https://<usuario>.github.io`.
   - No hace falta configurar URI de redireccionamiento ni usar el secreto de cliente.
4. Copiá el **ID de cliente** (`…apps.googleusercontent.com`). Lo vas a pegar en el paso 4.

---

## 3. Crear el proyecto de Apps Script

1. Entrá a [script.google.com](https://script.google.com) con la misma cuenta.
2. **Nuevo proyecto** y ponele un nombre, por ejemplo `Gestión Educativa – Liceo N.º 5`.
3. Borrá el contenido de `Código.gs` y pegá [`apps-script/Codigo.gs`](../apps-script/Codigo.gs).
4. Arriba de todo del archivo está la constante `ADMINISTRADORES_INICIALES`: revisá que estén las
   personas correctas antes de instalar (ver paso 5).
5. Opcional: en **Configuración del proyecto** activá *Mostrar el archivo de manifiesto
   `appsscript.json`* y pegá el contenido de [`apps-script/appsscript.json`](../apps-script/appsscript.json).

### Implementar como aplicación web

1. **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. *Ejecutar como*: **Yo** (tu cuenta será la dueña de la carpeta y de los archivos).
4. *Quién tiene acceso*: **Cualquier usuario**.
   Es necesario porque una página estática no puede autenticarse con la sesión de Google del
   navegador contra Apps Script. El control de acceso real lo hace el sistema: verifica el ID token
   de Google y exige que ese correo esté en la hoja «Usuarios».
5. Copiá la **URL de la aplicación web** (termina en `/exec`).
6. La primera vez Google pide autorización: aceptá los permisos de Drive, Hojas de cálculo,
   Formularios y disparadores.

---

## 4. Ejecutar la configuración inicial

1. Abrí la aplicación publicada → **Configuración**.
2. En *Conexión con Google Drive*: modo **Google Drive (Apps Script)**, pegá la URL `/exec` y tocá
   **Probar conexión** (tiene que responder «Conexión correcta»).
3. En *Configuración inicial en Drive* completá:
   - **Nombre del liceo**.
   - **ID de cliente OAuth** (el del paso 2). Cargalo acá: una vez instalado, el sistema sólo acepta
     cuentas autorizadas, y sin ID de cliente nadie podría ingresar para configurarlo.
   - *Carpeta existente*: sólo si ya tenés una carpeta y querés usar esa (pegá su ID, que es la parte
     final de su URL en Drive).
4. **Ejecutar configuración inicial**.

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
planilla de respuestas, y la lista de administradores dados de alta. Ya podés cerrar sesión y entrar
con **Acceder con Google**.

> También podés ejecutar `configuracionInicial()` desde el editor de Apps Script.
> Si te salteaste el ID de cliente, cargalo con la función `definirClientId('…apps.googleusercontent.com')`
> desde el editor, o escribiéndolo a mano en la hoja «General» del archivo de configuración
> (fila `clientId`).

---

## 5. Usuarios y accesos

La configuración inicial deja creados los **administradores**:

| Nombre | Correos de Google |
| --- | --- |
| Florencia Austria | `florenciaaustria03@gmail.com` |
| Martín Ferreira | `martinfp642@gmail.com` · `martinferreira@hca.edu.uy` |

Están definidos en `ADMINISTRADORES_INICIALES`, arriba de todo en `apps-script/Codigo.gs`: se puede
editar la lista antes de instalar. Si la cuenta que ejecuta la configuración inicial no es ninguna de
ésas, se agrega también como administradora —es la dueña de la carpeta de Drive, así que de todos
modos tiene acceso completo a los archivos—; se puede quitar después desde la hoja «Usuarios».

En **Configuración → Usuarios y accesos** (o directamente en la hoja «Usuarios») agregá al resto:

| Columna | Contenido |
| --- | --- |
| `id` | Identificador interno (se genera solo) |
| `nombre` | Nombre y apellido |
| `email` | Correo principal de Google con el que entra (obligatorio) |
| `emailsAdicionales` | **Otros correos de la misma persona**, separados por coma |
| `rol` | `admin`, `direccion`, `adscripcion`, `administrativo`, `psicologia`, `docente` o `lectura` |
| `activo` | `sí` / `no` — permite dar de baja un acceso sin borrar la fila |
| `observaciones` | Texto libre |

**Varios correos por persona.** Es habitual tener la cuenta institucional y además una personal, o
cambiar de dominio. Poné la habitual en `email` y las demás en `emailsAdicionales` (por ejemplo
`martinferreira@hca.edu.uy`): con cualquiera de ellas entra al mismo usuario, con el mismo rol y el
mismo historial. Los correos no distinguen mayúsculas.

Quien no figure en la hoja recibe un mensaje claro: su cuenta no está autorizada y tiene que pedirle
el alta a un administrador.

> **Bajas**: poné `activo` en `no` (o borrá la fila) cuando alguien deja el cargo. El efecto es
> inmediato: sin fila activa, esa cuenta de Google deja de tener acceso.

---

## 6. Cargar el horario institucional

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

## 7. Formulario para docentes

La configuración inicial crea el formulario **«Aviso de inasistencia docente»** dentro de
`03 · Inasistencias`, ya vinculado a la planilla de respuestas y con un disparador que copia cada
respuesta a la hoja «Inasistencias».

- Compartí con los docentes el enlace público del formulario.
- La URL queda guardada en *Configuración → Datos de la institución* y aparece como acceso directo
  en Inicio e Inasistencias.
- Los docentes **no necesitan usuario en el sistema** para avisar: alcanza con el formulario. El
  usuario hace falta sólo para entrar a la aplicación.
- Pedile a cada docente que escriba su nombre **como figura en el horario institucional**. El cruce
  ignora acentos, mayúsculas, comas y el orden de las palabras (`López, María` = `maría lópez`),
  pero no adivina apodos.

---

## 8. Mantenimiento

- **Actualizar el backend**: pegá la nueva versión de `Codigo.gs` y creá una implementación nueva
  (o actualizá la existente). La URL `/exec` se mantiene si actualizás la misma implementación.
- **Respaldos**: *Configuración → Datos y respaldos* descarga un JSON con todo. La carpeta de Drive
  ya es en sí misma el respaldo vivo del sistema.
- **Cambio de año lectivo**: agregá el año nuevo, subí su horario y marcalo como activo. El año
  anterior queda archivado, con su horario intacto.
- **Cambió la dirección de la aplicación**: actualizá los *Orígenes autorizados de JavaScript* del ID
  de cliente OAuth, o el botón de Google deja de funcionar.

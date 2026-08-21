# Alta de una institución

El sistema es multiinstitución: **cada liceo guarda sus datos en el Google Drive de quien lo dirige**.
Este documento describe cómo se crea una institución nueva. Lo hace un **superadministrador del sitio**
(definidos en `SUPER_ADMINS`, en `assets/js/settings.js`) junto con la persona que va a administrar el
liceo, porque hay pasos que sólo pueden hacerse desde la cuenta de Google de la institución.

Al sistema se entra **únicamente con cuenta de Google**, y sólo si ese correo figura en la hoja
«Usuarios» de la institución. No hay contraseñas ni códigos.

---

## Cómo se crea una institución (automático)

Nadie copia ni pega código. El asistente **Crear institución** de la pantalla de acceso hace todo por
API: crea el proyecto de Apps Script en la cuenta de la institución, le sube el código del sistema
(que el propio sitio publica en `apps-script/`), lo publica como aplicación web y arma la carpeta con
las planillas y el formulario en **su** Drive.

Los pasos, tal como los ve la gente:

1. Un superadministrador toca **Crear institución** y se identifica con su cuenta de Google.
2. Pone el **nombre** del liceo (y, si quiere, más administradores).
3. Toca **Elegir cuenta y crear**: Google pide elegir la **cuenta de la institución** y aceptar los
   permisos. El sitio crea y publica el proyecto solo, mostrando el progreso.
4. **Autorizar**: se abre una pestaña de Google donde la cuenta dueña acepta que el sistema use su
   Drive, sus planillas y su formulario. La pantalla detecta la autorización y termina sola: carpeta
   creada, administradores dados de alta, enlace de invitación disponible.

Dos detalles de Google que conviene saber:

- **API de Apps Script**: la cuenta de la institución tiene que tener prendido el interruptor
  «API de Google Apps Script» en [script.google.com/home/usersettings](https://script.google.com/home/usersettings)
  (una sola vez). Si está apagado, el asistente lo detecta, muestra el enlace y ofrece reintentar.
- **Usuarios de prueba**: mientras la pantalla de consentimiento OAuth del sitio esté en modo
  *Externo* sin publicar, la cuenta de la institución debe estar agregada como *usuario de prueba* en
  Google Cloud Console para poder aceptar los permisos de creación. Publicando la aplicación, esto
  deja de hacer falta.

## Cómo se suma el equipo

- El administrador agrega a cada persona en **Configuración → Usuarios y accesos** (correo de Google,
  rol, correos adicionales si tiene varios).
- Les comparte el **enlace de invitación** (*Configuración → Copiar enlace de invitación*). Quien lo
  abre queda conectado a esa institución y entra con su cuenta de Google. Nadie ve URLs ni
  configuración técnica.
- Un mismo navegador puede tener varias instituciones conectadas y cambiar entre ellas desde la
  pantalla de acceso.

---

# Puesta en marcha del sitio (una sola vez)

Lo que sigue es del mantenimiento del sitio, no de las instituciones.

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
4. Copiá el **ID de cliente** (`…apps.googleusercontent.com`) y ponelo en la constante
   `CLIENT_ID_SITIO` de `assets/js/settings.js`. Es único para todo el sitio: los asistentes de
   creación se lo pasan automáticamente a cada institución.

> Con la pantalla de consentimiento en modo **Externo** sin publicar, sólo entran las cuentas
> agregadas como *usuarios de prueba*. Para que cualquier cuenta de Google pueda ingresar, publicá la
> aplicación (**Publicar aplicación** en la pantalla de consentimiento).

---

## 3. Cargar el horario institucional (por institución)

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

## 4. Formulario para docentes

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

## 5. Mantenimiento

- **Actualizar el backend**: pegá la nueva versión de `Codigo.gs` y creá una implementación nueva
  (o actualizá la existente). La URL `/exec` se mantiene si actualizás la misma implementación.
- **Respaldos**: *Configuración → Datos y respaldos* descarga un JSON con todo. La carpeta de Drive
  ya es en sí misma el respaldo vivo del sistema.
- **Cambio de año lectivo**: agregá el año nuevo, subí su horario y marcalo como activo. El año
  anterior queda archivado, con su horario intacto.
- **Cambió la dirección de la aplicación**: actualizá los *Orígenes autorizados de JavaScript* del ID
  de cliente OAuth, o el botón de Google deja de funcionar.

# Gestión Educativa – Liceo

Aplicación web para **horarios institucionales, inasistencias docentes, coberturas y parte diario**.

El frontend es estático (HTML + CSS + JavaScript, sin build ni dependencias) y se publica en **GitHub Pages**.
Es **multiinstitución**: cada liceo tiene su propia carpeta en el **Google Drive de quien lo dirige**, con su
configuración, sus usuarios, sus horarios, sus inasistencias y sus partes diarios. Un proyecto de
**Google Apps Script** implementado desde esa misma cuenta lee y escribe la carpeta y expone un API JSON.

> La aplicación no es la base de datos: es la ventana. La soberanía de los datos la tiene cada institución
> —dueña de su carpeta, de sus planillas y de sus accesos—, no quien mantiene este sitio.

## Qué resuelve

Cuando un docente avisa que faltará:

1. Completa un **Google Form** (o Adscripción lo carga a mano).
2. La respuesta queda en la planilla de **inasistencias**, dentro de la carpeta de Drive.
3. La aplicación **cruza el aviso con el horario institucional** del año correspondiente y detecta
   qué grupos y qué horas quedan sin docente.
4. Adscripción ve el aviso en su bandeja, con los grupos y horas ya calculados.
5. Esos registros entran **automáticamente al parte diario**, que sigue siendo editable.
6. Para cada hora sin docente el sistema **sugiere quién puede cubrirla** (docentes libres en esa franja).
7. El parte se **exporta** a ODS, XLSX, CSV o PDF, y puede guardarse como planilla dentro de la carpeta de Drive.

## Arquitectura

```text
   DOCENTE ──► Google Form ──► Planilla de inasistencias ─┐
                                                          │  (todo dentro de una
   ADMINISTRADOR ──► planilla de horarios por año ────────┤   sola carpeta de Drive)
                                                          │
                     Partes diarios / Configuración ──────┘
                                    │
                          Google Apps Script  (API JSON: lee y escribe la carpeta)
                                    │
                         GitHub Pages (esta aplicación)
                                    │
        Inasistencias · Horarios · Coberturas · Parte diario · Exportaciones
```

Estructura que se crea en Drive con la configuración inicial:

```text
📁 Gestión Educativa – <Liceo>
   ├── 01 · Configuración    → planilla «Configuración»: General, Usuarios, Turnos, Años, Motivos
   ├── 02 · Horarios         → planilla «Horarios» (una fila por clase) + carpeta «Originales»
   ├── 03 · Inasistencias    → formulario docente + planilla de avisos
   ├── 04 · Partes diarios   → planilla «Partes diarios» + un archivo por día (AAAA/MM)
   └── 05 · Exportaciones    → copias y respaldos
```

## Cómo se organiza

- **Superadministradores del sitio** (constante `SUPER_ADMINS` en `assets/js/settings.js`): las únicas
  cuentas que pueden usar el asistente «Crear institución». No tienen acceso a los datos de ninguna
  institución por ese solo hecho.
- **Administrador de cada institución**: la cuenta de Google que implementa el Apps Script. Es dueña de
  la carpeta de Drive y decide quién entra; puede incluso quitar a los superadministradores de su hoja
  de usuarios.
- **El equipo de la institución** se conecta con un **enlace de invitación** (se copia desde
  Configuración) y entra con su cuenta de Google, sin ver ninguna configuración técnica.
- El **ID de cliente OAuth** es único del sitio (`CLIENT_ID_SITIO`), porque pertenece al origen web,
  no a una institución.

## Probarla sin configurar nada

Abrí la aplicación publicada y usá el **modo demostración**: genera un horario completo, avisos de
inasistencia y un parte diario de ejemplo, guardados sólo en tu navegador. Sirve para recorrer todas
las pantallas antes de conectar Google.

## Alta de una institución

Es **totalmente automática** (nadie copia código): un superadministrador abre **Crear institución**,
pone el nombre, y la persona que dirige el liceo elige su cuenta de Google y acepta los permisos. El
sitio usa la API de Apps Script para crear el proyecto en esa cuenta, subir el código, publicarlo como
aplicación web y armar la carpeta en **su** Drive; la cuenta dueña autoriza al final con un clic y
queda como administradora. El detalle está en [`docs/instalacion.md`](docs/instalacion.md).

Después, cada institución por su cuenta:

1. **Da accesos** en *Configuración → Usuarios y accesos*: se entra únicamente con cuenta de Google y
   sólo si el correo figura en la hoja «Usuarios»; una persona puede tener varios correos asociados.
2. **Comparte el enlace de invitación** con su equipo (*Configuración → Copiar enlace de invitación*).
3. **Carga el horario del año**: *Horarios institucionales → Subir horario* (XLSX, ODS o CSV).
4. **Difunde el formulario** de aviso a sus docentes, que no necesitan usuario.

## Roles

| Rol | Qué puede hacer |
| --- | --- |
| Administrador | Todo: configuración, usuarios, horarios, inasistencias, parte, exportaciones |
| Dirección | Ver todo, editar avisos y parte, exportar, administrar configuración |
| Adscripción | Avisos, coberturas, parte diario, exportaciones, consulta de horarios |
| Administrativo | Consulta de avisos, horarios y parte + exportaciones |
| Psicología / equipo | Consulta de avisos, horarios y parte |
| Docente | Consulta de horarios |

Los roles se definen en la hoja **Usuarios** de la planilla de configuración, dentro de la carpeta de
Drive de cada institución. Cada fila admite un correo principal y una lista de correos adicionales, de
modo que una misma persona entre con cualquiera de sus cuentas de Google y conserve su rol.

El ingreso se resuelve así: el navegador obtiene un ID token de Google, el backend de la institución lo
verifica contra `oauth2.googleapis.com/tokeninfo`, comprueba que el `aud` coincida con el ID de cliente
del sitio y busca el correo entre sus usuarios autorizados. Si no está, no entra: no hay contraseñas ni
códigos, y cada institución sólo conoce a su propia gente.

## Estructura del repositorio

```text
index.html                 Cascarón de la aplicación
assets/css/styles.css      Estilos (claro/oscuro, responsive, hoja de impresión)
assets/js/
  app.js                   Enrutador y arranque
  db.js                    Estado y persistencia (demo local o Google)
  api.js                   Cliente del API de Apps Script
  sesion.js                Sesión, roles y permisos
  google.js                Ingreso con cuenta de Google (Google Identity Services)
  logica.js                Cruce de inasistencias, parte diario y coberturas
  modelo.js                Modelo de datos y configuración por defecto
  importar.js              Lectura de planillas (CSV nativo, XLSX/ODS con SheetJS)
  fabrica.js               Creación automática de instituciones (API de Apps Script)
  exportar.js              Generación de ODS / XLSX / CSV (escritor ZIP propio)
  demo.js                  Datos de demostración
  views/                   Una pantalla por archivo
apps-script/Codigo.gs      Backend: carpeta de Drive como base de datos
docs/                      Instalación y manual de uso
```

## Notas técnicas

- **Sin dependencias ni build**: se sirve tal cual. Sólo se carga SheetJS desde un CDN, y únicamente
  cuando se importa un XLSX u ODS (el CSV se lee con un analizador propio).
- **Exportaciones sin librerías**: `exportar.js` incluye un escritor ZIP mínimo que genera archivos
  `.ods` y `.xlsx` válidos.
- **PDF**: se genera con la impresión del navegador; hay una hoja de estilos de impresión dedicada.
- Los PDF de horarios **no** se interpretan automáticamente: conviene subir XLSX, ODS o CSV.

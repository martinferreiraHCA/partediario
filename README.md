# Gestión Educativa – Liceo

Aplicación web para **horarios institucionales, inasistencias docentes, coberturas y parte diario**.

El frontend es estático (HTML + CSS + JavaScript, sin build ni dependencias) y se publica en **GitHub Pages**.
Toda la información vive en **una única carpeta de Google Drive**: allí están la configuración, los usuarios,
los horarios, las inasistencias y los partes diarios. Un proyecto de **Google Apps Script** publicado como
aplicación web es el que lee y escribe esa carpeta y expone un API JSON.

> La aplicación no es la base de datos: es la ventana para trabajar cómodamente con lo que ocurre en Drive.

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

## Probarla sin configurar nada

Abrí la aplicación publicada y usá el **modo demostración**: genera un horario completo, avisos de
inasistencia y un parte diario de ejemplo, guardados sólo en tu navegador. Sirve para recorrer todas
las pantallas antes de conectar Google.

## Puesta en marcha

1. **Publicar el frontend**: en el repositorio, *Settings → Pages → Source: GitHub Actions*
   (el workflow `.github/workflows/pages.yml` ya está incluido) o *Deploy from branch* apuntando a la raíz.
2. **Crear el backend en Drive**: seguí [`docs/instalacion.md`](docs/instalacion.md).
   Resumen: crear un proyecto de Apps Script, pegar `apps-script/Codigo.gs`, implementarlo como
   aplicación web y ejecutar la **configuración inicial** desde la pantalla *Configuración*.
3. **Cargar el horario del año**: *Horarios institucionales → Subir horario* (XLSX, ODS o CSV).
4. **Habilitar el ingreso con Google**: creá un ID de cliente OAuth y cargalo en
   *Configuración → Ingreso con cuenta de Google* (pasos en la misma guía).
5. **Dar accesos**: *Configuración → Usuarios y accesos*. Cada persona entra con su cuenta de Google
   —puede tener **varios correos asociados**, institucional y personal— o con un código, si no tiene
   cuenta de Google.

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
Drive. Cada fila admite un correo principal y una lista de correos adicionales, de modo que una misma
persona entre con cualquiera de sus cuentas de Google y conserve su rol.

El ingreso se resuelve así: el navegador obtiene un ID token de Google, el backend lo verifica contra
`oauth2.googleapis.com/tokeninfo`, comprueba que el `aud` coincida con el ID de cliente configurado y
busca el correo entre los usuarios autorizados.

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

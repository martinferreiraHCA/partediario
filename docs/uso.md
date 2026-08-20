# Manual de uso

## Inicio

Resumen del día: docentes ausentes, grupos y horas afectadas, horas sin cobertura, avisos nuevos,
vista previa del parte y próximas inasistencias.

## Inasistencias

Bandeja de avisos, con tres pestañas: **Hoy**, **Próximas** e **Historial**.

Cada aviso muestra el docente, la fecha, el turno, el motivo y —lo importante— **las clases que quedan
sin docente**, calculadas contra el horario institucional del año.

Acciones sobre un aviso:

- **Marcar revisada** (o volver a marcarla como nueva).
- **Editar**: corregir el nombre, la fecha, el motivo, las observaciones o limitar la ausencia a
  determinadas horas (campo *Horas afectadas*: por ejemplo `3,4`; vacío significa todo el día).
- **Ver parte del día** / **Ver horario** del docente.
- **Eliminar**.

Si un docente no aparece en el horario, el aviso queda igual registrado con la advertencia
«Sin clases en el horario institucional».

## Horarios

Cuatro formas de mirar lo mismo:

- **Por día**: grilla grupos × horas. Las clases de docentes con aviso ese día quedan marcadas.
- **Por grupo**: semana completa del grupo, más el detalle de materias y docentes.
- **Por docente**: semana completa y carga horaria.
- **Buscar**: por docente, materia, grupo o salón.

Con permisos de administración, cada celda se puede editar: tocar una clase la abre para modificarla
o eliminarla, y las celdas vacías permiten agregar una clase. No hace falta volver a subir toda la
planilla por un cambio menor.

## Coberturas

Para el día elegido lista cada hora sin docente y propone quién puede cubrirla. Las sugerencias salen
del propio horario: se descartan quienes ya tienen clase en esa hora y quienes avisaron inasistencia
ese día, y se prioriza a quien ya está en el liceo (dicta la hora anterior o la siguiente) y a quien
ya trabaja con ese grupo.

La cobertura asignada queda registrada en el parte diario.

## Parte diario

Se arma solo con los avisos del día, pero **Adscripción mantiene el control**:

- Agregar registros que no vinieron del formulario.
- Editar cualquier campo (hora, grupo, materia, motivo, cobertura, observaciones).
- Eliminar lo que no corresponda.
- Marcar el parte como **cerrado**.

Los registros editados a mano no se pisan cuando llega un aviso nuevo: el sistema agrega lo que falta
y respeta lo que ya trabajaste. Los cambios quedan en pantalla hasta que apretás **Guardar cambios**.

Exportaciones: **ODS** (LibreOffice / OpenOffice), **XLSX**, **CSV**, **Imprimir / PDF** y —cuando se
trabaja contra Drive— **guardar una copia** dentro de `04 · Partes diarios/AAAA/MM`.

## Horarios institucionales

Un horario por año lectivo. Cada año puede estar **activo**, **archivado** o **pendiente**; el activo
es el que se usa para cruzar las inasistencias. Desde acá se sube o se reemplaza la planilla del año,
se exporta el horario y se descargan plantillas de ejemplo.

## Configuración

- **Conexión**: modo demostración o Google Drive, URL de Apps Script, quién está identificado y con
  qué cuenta, y la frecuencia de actualización automática.
- **Ingreso con cuenta de Google**: ID de cliente OAuth que habilita el botón *Acceder con Google*.
- **Configuración inicial**: crea la estructura de carpetas y archivos en Drive.
- **Usuarios y accesos**: alta, baja, rol y correos de cada persona (sólo administradores). Una misma
  persona puede tener varios correos de Google asociados: entra con cualquiera de ellos.
- **Datos de la institución**: liceo, motivos de inasistencia y enlace al formulario.
- **Turnos y módulos**: los horarios de cada módulo, que se muestran en la grilla y en el parte.
- **Datos y respaldos**: descargar o restaurar un respaldo completo en JSON.

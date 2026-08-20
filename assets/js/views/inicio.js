/* Inicio: resumen del día y accesos rápidos. */

import { el, hoyISO, fmtFechaLarga, DIAS, diaSemana, ordinalHora } from '../utils.js';
import { vacio, tarjeta } from '../ui.js';
import { resumenDelDia, proximasInasistencias, filasAutomaticas, listaDocentes, listaGrupos } from '../logica.js';
import { anioActivo } from '../modelo.js';
import { getSettings } from '../settings.js';
import { puede } from '../sesion.js';
import { tarjetaInasistencia, dialogoInasistencia } from './componentes.js';

export async function render(host, ctx) {
  const estado = ctx.estado;
  const hoy = hoyISO();
  const anio = anioActivo(estado.config);
  const resumen = resumenDelDia(estado, hoy);
  const proximas = proximasInasistencias(estado, hoy).slice(0, 6);
  const { formUrl } = getSettings();

  ctx.setTitulo('Inicio', `${DIAS[diaSemana(hoy)]} ${fmtFechaLarga(hoy)} · ${estado.config.liceo || ''}`);
  ctx.setAcciones([
    puede('editarInasistencias') ? el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: async () => { if (await dialogoInasistencia(estado)) ctx.refrescar(); },
    }, '＋ Registrar inasistencia') : null,
    formUrl ? el('a', { class: 'btn', href: formUrl, target: '_blank', rel: 'noopener' }, '📋 Abrir formulario') : null,
  ]);

  /* --- indicadores --- */
  const indicadores = el('div', { class: 'grid grid-4' }, [
    stat('Docentes ausentes hoy', resumen.docentes, resumen.nuevas ? `${resumen.nuevas} aviso(s) sin revisar` : 'Todo revisado', true),
    stat('Grupos afectados', resumen.grupos, 'según el horario del año ' + anio),
    stat('Horas de clase afectadas', resumen.horas, 'suman al parte diario'),
    stat('Horas sin cobertura', resumen.sinCobertura, resumen.sinCobertura ? 'requieren asignar docente' : 'todo cubierto'),
  ]);

  /* --- avisos de hoy --- */
  const deHoy = resumen.inasistencias;
  const listaHoy = deHoy.length
    ? el('div', { class: 'list' }, deHoy.map(ina => tarjetaInasistencia(estado, ina, {
        alCambiar: () => ctx.refrescar(),
        irParte: (fecha) => ctx.ir('parte', { fecha }),
        irHorario: (docente) => ctx.ir('horarios', { modo: 'docente', docente }),
      })))
    : vacio('No hay inasistencias registradas para hoy.', '✅');

  /* --- vista previa del parte --- */
  const parte = estado.partes[hoy];
  const filas = parte ? parte.filas.slice() : filasAutomaticas(estado, hoy);
  const tablaParte = filas.length
    ? el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
        el('thead', {}, el('tr', {}, ['Hora', 'Docente', 'Grupo', 'Materia', 'Motivo', 'Cobertura'].map(t => el('th', {}, t)))),
        el('tbody', {}, filas.slice(0, 8).map(f => el('tr', {}, [
          el('td', { class: 'mono' }, f.hora ? ordinalHora(f.hora) : '—'),
          el('td', {}, f.docente),
          el('td', {}, f.grupo || '—'),
          el('td', {}, f.materia || '—'),
          el('td', {}, f.motivo || 'Inasistencia'),
          el('td', {}, f.cobertura || el('span', { class: 'chip warn' }, 'sin cobertura')),
        ]))),
      ]))
    : vacio('El parte de hoy todavía no tiene registros.', '📝');

  /* --- próximas --- */
  const listaProximas = proximas.length
    ? el('div', { class: 'list' }, proximas.map(ina => el('article', { class: 'item' }, [
        el('div', { class: 'item-head' }, [
          el('strong', {}, ina.docente),
          el('span', { class: 'chip info' }, fmtFechaLarga(ina.fecha)),
          ina.motivo ? el('span', { class: 'chip' }, ina.motivo) : null,
        ]),
        el('div', { class: 'item-body' }, [
          el('span', {}, `${DIAS[diaSemana(ina.fecha)]}`),
          ina.turno ? el('span', {}, ina.turno) : null,
          ina.observaciones ? el('span', {}, ina.observaciones) : null,
        ]),
      ])))
    : vacio('No hay avisos futuros cargados.', '📆');

  /* --- estado del sistema --- */
  const docentes = listaDocentes(estado, anio).length;
  const grupos = listaGrupos(estado, anio).length;
  const clases = estado.horarios.filter(c => Number(c.anio) === anio).length;

  const sistema = el('div', { class: 'card-pad stack' }, [
    linea('Año activo', String(anio)),
    linea('Clases en el horario', String(clases)),
    linea('Grupos', String(grupos)),
    linea('Docentes', String(docentes)),
    linea('Origen de los datos', estado.meta.modo === 'google' ? 'Google Sheets' : 'Demostración (este navegador)'),
    estado.meta.ultimaCarga ? linea('Última actualización', estado.meta.ultimaCarga.toLocaleTimeString('es-UY')) : null,
    estado.meta.error ? el('p', { class: 'chip warn', text: estado.meta.error }) : null,
    el('div', { class: 'row' }, [
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => ctx.ir('institucional') }, '🗂️ Horarios institucionales'),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => ctx.ir('configuracion') }, '⚙️ Configuración'),
    ]),
  ]);

  host.append(
    el('div', { class: 'stack' }, [
      indicadores,
      el('div', { class: 'grid grid-2' }, [
        tarjeta(`Inasistencias de hoy (${deHoy.length})`, el('div', { class: 'card-pad' }, listaHoy),
          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => ctx.ir('inasistencias') }, 'Ver todas')),
        el('div', { class: 'stack' }, [
          tarjeta('Parte diario de hoy', tablaParte,
            el('button', { class: 'btn btn-sm', type: 'button', onclick: () => ctx.ir('parte', { fecha: hoy }) }, 'Abrir parte')),
          tarjeta('Próximas inasistencias', el('div', { class: 'card-pad' }, listaProximas)),
          tarjeta('Estado del sistema', sistema),
        ]),
      ]),
    ]),
  );
}

function stat(titulo, valor, sub, acento = false) {
  return el('div', { class: `card stat ${acento ? 'accent' : ''}` }, [
    el('div', { class: 'k', text: titulo }),
    el('div', { class: 'v', text: String(valor) }),
    el('div', { class: 's', text: sub || '' }),
  ]);
}

function linea(k, v) {
  return el('div', { class: 'row', style: 'justify-content:space-between' }, [
    el('span', { class: 'muted small' }, k),
    el('strong', { class: 'small' }, v),
  ]);
}


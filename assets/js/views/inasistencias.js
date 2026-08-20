/* Inasistencias: bandeja de avisos con pestañas Hoy / Próximas / Historial. */

import { el, hoyISO, fmtFechaLarga, contiene, DIAS, diaSemana } from '../utils.js';
import { vacio } from '../ui.js';
import { inasistenciasDeFecha, proximasInasistencias, historialInasistencias, resumenInasistencia } from '../logica.js';
import { puede } from '../sesion.js';
import { getSettings } from '../settings.js';
import { tarjetaInasistencia, dialogoInasistencia } from './componentes.js';

export async function render(host, ctx) {
  const estado = ctx.estado;
  const params = ctx.params();
  const pestania = params.tab || 'hoy';
  const busqueda = params.q || '';
  const hoy = hoyISO();
  const { formUrl } = getSettings();

  const nuevas = estado.inasistencias.filter(i => i.estado === 'nueva').length;
  ctx.setTitulo('Inasistencias', nuevas ? `${nuevas} aviso(s) sin revisar` : 'Todos los avisos están revisados');
  ctx.setAcciones([
    puede('editarInasistencias') ? el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: async () => { if (await dialogoInasistencia(estado)) ctx.refrescar(); },
    }, '＋ Registrar inasistencia') : null,
    formUrl ? el('a', { class: 'btn', href: formUrl, target: '_blank', rel: 'noopener' }, '📋 Formulario docente') : null,
  ]);

  let lista;
  if (pestania === 'proximas') lista = proximasInasistencias(estado, hoy);
  else if (pestania === 'historial') lista = historialInasistencias(estado, hoy);
  else lista = inasistenciasDeFecha(estado, hoy);

  if (busqueda) {
    lista = lista.filter(i => contiene(i.docente, busqueda) || contiene(i.motivo, busqueda)
      || contiene(i.observaciones, busqueda) || contiene(i.fecha, busqueda));
  }

  const tabs = el('div', { class: 'tabs' }, [
    ['hoy', `Hoy (${inasistenciasDeFecha(estado, hoy).length})`],
    ['proximas', `Próximas (${proximasInasistencias(estado, hoy).length})`],
    ['historial', `Historial (${historialInasistencias(estado, hoy).length})`],
  ].map(([id, texto]) => el('button', {
    class: `tab ${pestania === id ? 'active' : ''}`, type: 'button',
    onclick: () => { ctx.setParam('tab', id); ctx.refrescar(); },
  }, texto)));

  const buscador = el('input', {
    type: 'text', value: busqueda, placeholder: 'Buscar docente, motivo o fecha…',
    oninput: (ev) => { clearTimeout(buscador._t); buscador._t = setTimeout(() => { ctx.setParam('q', ev.target.value); ctx.refrescar(); }, 300); },
  });

  const agrupadas = agruparPorFecha(lista);
  const contenido = lista.length
    ? el('div', { class: 'stack' }, Array.from(agrupadas.entries()).map(([fecha, items]) => el('div', { class: 'stack' }, [
        el('div', { class: 'row' }, [
          el('h3', { style: 'font-size:14px' }, `${DIAS[diaSemana(fecha)]} ${fmtFechaLarga(fecha)}`),
          el('span', { class: 'chip' }, `${items.length} aviso(s)`),
          el('span', { class: 'chip info' }, `${items.reduce((s, i) => s + resumenInasistencia(estado, i).cantidad, 0)} hora(s) de clase`),
          el('button', {
            class: 'btn btn-sm', type: 'button', style: 'margin-left:auto',
            onclick: () => ctx.ir('parte', { fecha }),
          }, '📝 Parte del día'),
        ]),
        el('div', { class: 'list' }, items.map(ina => tarjetaInasistencia(estado, ina, {
          alCambiar: () => ctx.refrescar(),
          irParte: (f) => ctx.ir('parte', { fecha: f }),
          irHorario: (docente) => ctx.ir('horarios', { modo: 'docente', docente }),
        }))),
      ])))
    : vacio(pestania === 'hoy'
        ? 'No hay inasistencias registradas para hoy.'
        : 'No hay avisos que coincidan con la búsqueda.', '📭');

  host.append(el('div', { class: 'stack' }, [
    el('div', { class: 'toolbar' }, [
      tabs,
      el('label', { class: 'field grow' }, [el('span', {}, 'Buscar'), buscador]),
    ]),
    contenido,
  ]));

  if (busqueda) buscador.focus();
}

function agruparPorFecha(lista) {
  const mapa = new Map();
  for (const item of lista) {
    if (!mapa.has(item.fecha)) mapa.set(item.fecha, []);
    mapa.get(item.fecha).push(item);
  }
  return mapa;
}

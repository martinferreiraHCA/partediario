/* Piezas de interfaz compartidas por varias pantallas. */

import { el, ordinalHora, fmtFechaCorta, fmtFechaHora, compararNatural } from '../utils.js';
import { modalFormulario, confirmar, avisoOk, avisoError } from '../ui.js';
import { resumenInasistencia, listaDocentes } from '../logica.js';
import { anioActivo, horarioDeModulo } from '../modelo.js';
import { guardarInasistencia, eliminarInasistencia, marcarEstadoInasistencia } from '../db.js';
import { puede } from '../sesion.js';

/* ---------------- tarjeta de inasistencia ---------------- */

export function tarjetaInasistencia(estado, ina, opciones = {}) {
  const resumen = resumenInasistencia(estado, ina);
  const editable = puede('editarInasistencias') && opciones.soloLectura !== true;

  const clases = resumen.clases.length
    ? Array.from(resumen.porGrupo.entries())
      .sort((a, b) => compararNatural(a[0], b[0]))
      .map(([grupo, horas]) => el('span', { class: 'clase-pill' }, [
        el('b', {}, grupo),
        el('span', { class: 'muted' }, horas.sort((a, b) => a - b).map(ordinalHora).join(', ') + ' hora'),
      ]))
    : [el('span', { class: 'chip warn' }, 'Sin clases en el horario institucional')];

  return el('article', { class: `item ${ina.estado}`, dataset: { id: ina.id } }, [
    el('div', { class: 'item-head' }, [
      el('strong', { text: ina.docente || '(sin docente)' }),
      ina.estado === 'nueva' ? el('span', { class: 'chip new' }, 'NUEVA') : null,
      ina.estado === 'revisada' ? el('span', { class: 'chip ok' }, 'Revisada') : null,
      ina.motivo ? el('span', { class: 'chip' }, ina.motivo) : null,
      el('span', { class: 'muted small', style: 'margin-left:auto' }, fmtFechaCorta(ina.fecha)),
    ]),
    el('div', { class: 'item-body' }, [
      el('span', {}, `📅 ${fmtFechaCorta(ina.fecha)}`),
      ina.turno ? el('span', {}, `🕒 ${ina.turno}`) : null,
      ina.liceo ? el('span', {}, `🏫 ${ina.liceo}`) : null,
      el('span', {}, `🧮 ${resumen.cantidad} hora(s) · ${resumen.grupos.length} grupo(s)`),
      ina.observaciones ? el('span', {}, `📝 ${ina.observaciones}`) : null,
    ]),
    el('div', { class: 'clases' }, clases),
    el('div', { class: 'item-actions' }, [
      editable && ina.estado === 'nueva'
        ? el('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: async () => {
              await marcarEstadoInasistencia(ina.id, 'revisada');
              avisoOk('Aviso marcado como revisado.');
              opciones.alCambiar && opciones.alCambiar();
            },
          }, '✔ Marcar revisada')
        : null,
      editable && ina.estado === 'revisada'
        ? el('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: async () => {
              await marcarEstadoInasistencia(ina.id, 'nueva');
              opciones.alCambiar && opciones.alCambiar();
            },
          }, '↩ Marcar como nueva')
        : null,
      editable
        ? el('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: async () => {
              const datos = await dialogoInasistencia(estado, ina);
              if (!datos) return;
              opciones.alCambiar && opciones.alCambiar();
            },
          }, '✏️ Editar')
        : null,
      opciones.verParte !== false
        ? el('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: () => opciones.irParte && opciones.irParte(ina.fecha),
          }, '📝 Ver parte del día')
        : null,
      opciones.verHorario !== false
        ? el('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: () => opciones.irHorario && opciones.irHorario(ina.docente),
          }, '📅 Ver horario')
        : null,
      editable
        ? el('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onclick: async () => {
              const ok = await confirmar(`¿Eliminar el aviso de ${ina.docente} del ${fmtFechaCorta(ina.fecha)}?`,
                { titulo: 'Eliminar aviso', textoOk: 'Eliminar', peligro: true });
              if (!ok) return;
              await eliminarInasistencia(ina.id);
              avisoOk('Aviso eliminado.');
              opciones.alCambiar && opciones.alCambiar();
            },
          }, '🗑️ Eliminar')
        : null,
      el('span', { class: 'muted small', style: 'margin-left:auto' },
        ina.origen === 'manual' ? 'Carga manual' : `Formulario · ${fmtFechaHora(ina.timestamp)}`),
    ]),
  ]);
}

/* ---------------- alta / edición de inasistencia ---------------- */

export async function dialogoInasistencia(estado, ina = null) {
  const anio = anioActivo(estado.config);
  const docentes = listaDocentes(estado, anio);
  const turnos = [{ valor: '', texto: '(todos)' }]
    .concat(estado.config.turnos.map(t => ({ valor: t.id, texto: t.nombre })));

  const datos = await modalFormulario({
    titulo: ina ? 'Editar aviso de inasistencia' : 'Registrar inasistencia',
    textoOk: ina ? 'Guardar cambios' : 'Registrar',
    campos: [
      { name: 'docente', label: 'Docente', requerido: true, lista: docentes, ancho: 'full' },
      { name: 'fecha', label: 'Fecha de la inasistencia', tipo: 'date', requerido: true },
      { name: 'turno', label: 'Turno', tipo: 'select', opciones: turnos },
      { name: 'liceo', label: 'Liceo / centro educativo', lista: estado.config.liceos || [] },
      { name: 'motivo', label: 'Motivo', tipo: 'select', opciones: estado.config.motivos || ['Inasistencia'] },
      {
        name: 'horas', label: 'Horas afectadas (opcional)',
        hint: 'Vacío = todas las clases del día. Ejemplo: 3,4', ancho: 'full',
      },
      { name: 'observaciones', label: 'Observaciones', tipo: 'textarea', ancho: 'full' },
    ],
    valores: ina
      ? { ...ina, horas: (ina.horas || []).join(',') }
      : { fecha: new Date().toISOString().slice(0, 10), liceo: estado.config.liceo, motivo: 'Inasistencia' },
    validar: (d) => (!d.docente.trim() ? 'Indicá el nombre del docente.' : null),
  });
  if (!datos) return null;

  const horas = String(datos.horas || '').split(/[,;\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
  try {
    await guardarInasistencia({
      ...(ina || {}),
      ...datos,
      horas,
      origen: ina ? ina.origen : 'manual',
      estado: ina ? ina.estado : 'nueva',
      timestamp: ina ? ina.timestamp : new Date().toISOString(),
    });
    avisoOk(ina ? 'Aviso actualizado.' : 'Inasistencia registrada.');
    return datos;
  } catch (e) {
    avisoError(e.message || 'No se pudo guardar el aviso.');
    return null;
  }
}

/* ---------------- controles ---------------- */

export function campoFecha(valor, alCambiar, etiqueta = 'Fecha') {
  const input = el('input', { type: 'date', value: valor, onchange: (ev) => alCambiar(ev.target.value) });
  return el('label', { class: 'field' }, [el('span', {}, etiqueta), input]);
}

export function campoSelect(etiqueta, opciones, valor, alCambiar) {
  const select = el('select', { onchange: (ev) => alCambiar(ev.target.value) },
    opciones.map(o => {
      const val = typeof o === 'object' ? o.valor : o;
      const txt = typeof o === 'object' ? o.texto : o;
      return el('option', { value: val, selected: String(val) === String(valor) }, txt);
    }));
  return el('label', { class: 'field' }, [el('span', {}, etiqueta), select]);
}

export function campoTexto(etiqueta, valor, alEscribir, placeholder = '', lista = null) {
  const id = `dl_${Math.random().toString(36).slice(2, 8)}`;
  const input = el('input', {
    type: 'text', value: valor, placeholder, list: lista ? id : null,
    oninput: (ev) => alEscribir(ev.target.value),
  });
  return el('label', { class: 'field grow' }, [
    el('span', {}, etiqueta), input,
    lista ? el('datalist', { id }, lista.map(v => el('option', { value: v }))) : null,
  ]);
}

export function etiquetaHora(config, turno, hora) {
  const rango = horarioDeModulo(config, turno, hora);
  return rango ? `${ordinalHora(hora)} (${rango})` : ordinalHora(hora);
}

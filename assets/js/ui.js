/* Componentes de interfaz reutilizables: avisos, modales y formularios. */

import { el, clear, $ } from './utils.js';

/* ---------------- avisos ---------------- */

export function aviso(mensaje, tipo = '', ms = 4000) {
  const host = $('#toasts');
  // Sin repetidos ni pilas: el mismo texto no se muestra dos veces a la vez
  // y nunca hay más de tres avisos en pantalla.
  for (const previo of host.children) {
    if (previo.textContent === String(mensaje)) return previo;
  }
  while (host.children.length >= 3) host.firstChild.remove();
  const nodo = el('div', { class: `toast ${tipo}`, role: 'status' }, mensaje);
  host.append(nodo);
  setTimeout(() => {
    nodo.style.opacity = '0';
    nodo.style.transition = 'opacity .25s';
    setTimeout(() => nodo.remove(), 260);
  }, ms);
  return nodo;
}

export const avisoOk = (m) => aviso(m, 'ok');
export const avisoError = (m) => aviso(m, 'err', 7000);
export const avisoAtencion = (m) => aviso(m, 'warn', 5500);

/* ---------------- modal ---------------- */

let cerrarActual = null;

export function abrirModal({ titulo, cuerpo, acciones = [], ancho = '', alCerrar = null }) {
  cerrarModal();
  const host = $('#modal-host');
  host.hidden = false;

  const contenedor = el('div', { class: `modal ${ancho}` });
  const cerrar = () => {
    host.hidden = true;
    clear(host);
    document.removeEventListener('keydown', onKey);
    cerrarActual = null;
    if (alCerrar) alCerrar();
  };
  cerrarActual = cerrar;

  const onKey = (ev) => { if (ev.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', onKey);

  contenedor.append(
    el('div', { class: 'modal-head' }, [
      el('h3', { text: titulo }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, '✕'),
    ]),
    el('div', { class: 'modal-body' }, [cuerpo]),
  );

  if (acciones.length) {
    contenedor.append(el('div', { class: 'modal-foot' }, acciones.map(a =>
      el('button', {
        class: `btn ${a.clase || ''}`,
        type: 'button',
        onclick: () => a.onClick ? a.onClick(cerrar) : cerrar(),
      }, a.texto))));
  }

  clear(host).append(contenedor);
  host.onclick = (ev) => { if (ev.target === host) cerrar(); };
  const primerCampo = contenedor.querySelector('input,select,textarea,button');
  if (primerCampo) setTimeout(() => primerCampo.focus(), 30);
  return cerrar;
}

export function cerrarModal() {
  if (cerrarActual) cerrarActual();
}

export function confirmar(mensaje, { titulo = 'Confirmar', textoOk = 'Confirmar', peligro = false } = {}) {
  return new Promise(resolve => {
    let resuelto = false;
    const fin = (v) => { resuelto = true; resolve(v); };
    abrirModal({
      titulo,
      cuerpo: el('p', { text: mensaje }),
      alCerrar: () => { if (!resuelto) resolve(false); },
      acciones: [
        { texto: 'Cancelar', onClick: (c) => { fin(false); c(); } },
        { texto: textoOk, clase: peligro ? 'btn-danger' : 'btn-primary', onClick: (c) => { fin(true); c(); } },
      ],
    });
  });
}

/* ---------------- formularios ---------------- */

/**
 * campos: [{ name, label, tipo, valor, opciones, requerido, ancho, hint, lista }]
 * tipo: text | date | number | select | textarea | checkbox | time | url | datalist
 */
export function construirFormulario(campos, valores = {}) {
  const form = el('form', { class: 'grid grid-2', autocomplete: 'off' });
  const controles = {};

  for (const campo of campos) {
    const valor = valores[campo.name] ?? campo.valor ?? '';
    let control;
    if (campo.tipo === 'select') {
      control = el('select', { name: campo.name },
        (campo.opciones || []).map(o => {
          const val = typeof o === 'object' ? o.valor : o;
          const txt = typeof o === 'object' ? o.texto : o;
          return el('option', { value: val, selected: String(val) === String(valor) }, txt);
        }));
    } else if (campo.tipo === 'textarea') {
      control = el('textarea', { name: campo.name, placeholder: campo.placeholder || '' }, String(valor || ''));
    } else if (campo.tipo === 'checkbox') {
      control = el('input', { type: 'checkbox', name: campo.name });
      control.checked = !!valor;
      control.style.width = 'auto';
    } else {
      control = el('input', {
        type: campo.tipo || 'text',
        name: campo.name,
        value: valor ?? '',
        placeholder: campo.placeholder || '',
        list: campo.lista ? `lista-${campo.name}` : null,
        min: campo.min, max: campo.max, step: campo.step,
      });
    }
    if (campo.requerido) control.required = true;
    controles[campo.name] = control;

    const etiqueta = el('label', { class: 'field' }, [
      el('span', {}, [campo.label, campo.requerido ? el('span', { class: 'req' }, ' *') : null]),
      control,
      campo.lista ? el('datalist', { id: `lista-${campo.name}` },
        campo.lista.map(v => el('option', { value: v }))) : null,
      campo.hint ? el('span', { class: 'hint' }, campo.hint) : null,
    ]);
    if (campo.ancho === 'full') etiqueta.style.gridColumn = '1 / -1';
    form.append(etiqueta);
  }

  const leer = () => {
    const datos = {};
    for (const [name, ctrl] of Object.entries(controles)) {
      datos[name] = ctrl.type === 'checkbox' ? ctrl.checked : ctrl.value;
    }
    return datos;
  };

  return { form, controles, leer, valido: () => form.reportValidity() };
}

/** Modal con formulario. Resuelve con los datos o con null si se cancela. */
export function modalFormulario({ titulo, campos, valores = {}, textoOk = 'Guardar', ancho = '', validar = null, accionExtra = null }) {
  return new Promise(resolve => {
    const { form, leer, valido } = construirFormulario(campos, valores);
    let resuelto = false;
    const cerrar = abrirModal({
      titulo, cuerpo: form, ancho,
      alCerrar: () => { if (!resuelto) resolve(null); },
      acciones: [
        accionExtra ? {
          texto: accionExtra.texto,
          clase: accionExtra.clase || 'btn-danger',
          onClick: (c) => { resuelto = true; resolve(accionExtra.valor ?? { __accion: 'extra' }); c(); },
        } : null,
        { texto: 'Cancelar', onClick: (c) => c() },
        {
          texto: textoOk, clase: 'btn-primary',
          onClick: (c) => {
            if (!valido()) return;
            const datos = leer();
            if (validar) {
              const error = validar(datos);
              if (error) { avisoError(error); return; }
            }
            resuelto = true;
            resolve(datos);
            c();
          },
        },
      ].filter(Boolean),
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!valido()) return;
      const datos = leer();
      if (validar) {
        const error = validar(datos);
        if (error) { avisoError(error); return; }
      }
      resuelto = true;
      resolve(datos);
      cerrar();
    });
  });
}

/* ---------------- varios ---------------- */

export function vacio(mensaje, icono = '📭', extra = null) {
  return el('div', { class: 'empty' }, [
    el('span', { class: 'big' }, icono),
    el('p', {}, mensaje),
    extra,
  ]);
}

export function tarjeta(titulo, contenido, acciones = null) {
  return el('section', { class: 'card' }, [
    titulo ? el('div', { class: 'card-head' }, [
      el('h2', { text: titulo }),
      el('div', { class: 'spacer' }),
      acciones,
    ]) : null,
    contenido,
  ]);
}

export function tabla(columnas, filas, opciones = {}) {
  const t = el('table', { class: 'tbl' }, [
    el('thead', {}, el('tr', {}, columnas.map(c =>
      el('th', { class: c.clase || '' }, c.titulo)))),
    el('tbody', {}, filas.length
      ? filas.map(opciones.filaFn || (f => el('tr', {}, columnas.map(c => el('td', {}, String(f[c.campo] ?? ''))))))
      : [el('tr', {}, el('td', { colspan: columnas.length, class: 'muted', style: 'text-align:center;padding:26px' },
          opciones.vacio || 'Sin registros.'))]),
  ]);
  return el('div', { class: 'table-wrap' }, t);
}

/* Pantalla de acceso: ingreso con la cuenta de Google o con código personal. */

import { el, clear } from '../utils.js';
import { avisoError, avisoOk } from '../ui.js';
import { getSettings, setSettings } from '../settings.js';
import { iniciarSesionGoogle, iniciarSesionConCodigo, obtenerClientId, sesion } from '../sesion.js';
import { prepararIngresoGoogle } from '../google.js';
import { cargar } from '../db.js';

export function render(host, { alEntrar }) {
  const ajustes = getSettings();
  const url = el('input', { type: 'url', value: ajustes.apiUrl, placeholder: 'https://script.google.com/macros/s/…/exec' });
  const zonaGoogle = el('div', { style: 'min-height:44px;display:flex;justify-content:center' });
  const mensaje = el('div', {});
  const codigo = el('input', { type: 'text', placeholder: 'Ej.: 4KDF2-8HTQ1', autocomplete: 'off' });

  const tarjeta = el('form', { class: 'card card-pad stack', style: 'max-width:520px;margin:6vh auto' }, [
    el('h2', {}, 'Ingresar al sistema'),
    el('p', { class: 'small muted' },
      'La información vive en la carpeta de Google Drive del liceo. Ingresá con la cuenta de Google autorizada por el centro.'),
    mensaje,
    el('label', { class: 'field' }, [
      el('span', {}, 'URL de la aplicación web'), url,
      el('span', { class: 'hint' }, 'La provee quien administra el sistema. Queda guardada en este navegador.'),
    ]),
    zonaGoogle,
    el('div', { class: 'sep' }),
    el('details', {}, [
      el('summary', { class: 'small muted' }, 'No tengo cuenta de Google: entrar con código de acceso'),
      el('div', { class: 'stack', style: 'margin-top:10px' }, [
        el('label', { class: 'field' }, [el('span', {}, 'Código de acceso'), codigo]),
        el('button', { class: 'btn', type: 'submit' }, 'Entrar con código'),
      ]),
    ]),
    el('div', { class: 'row' }, [
      el('button', {
        class: 'btn btn-ghost', type: 'button',
        onclick: async () => {
          setSettings({ modo: 'demo' });
          await cargar();
          alEntrar();
        },
      }, 'Usar modo demostración'),
    ]),
    el('p', { class: 'hint' },
      '¿Todavía no está creada la carpeta del liceo? Configurá la conexión y ejecutá la configuración inicial desde Configuración.'),
  ]);

  const pintarMensaje = () => {
    clear(mensaje);
    if (sesion.motivo === 'sesion_vencida') {
      mensaje.append(el('p', { class: 'chip warn', style: 'display:block;padding:9px 12px' },
        'Tu sesión de Google venció. Volvé a ingresar.'));
    } else if (sesion.motivo === 'sin_autorizacion') {
      mensaje.append(el('div', { class: 'stack' }, [
        el('p', { class: 'chip warn', style: 'display:block;padding:9px 12px' },
          `La cuenta ${sesion.email || ''} no figura entre los usuarios autorizados.`),
        el('p', { class: 'hint' },
          'Pedile al administrador que agregue ese correo en Configuración → Usuarios y accesos. Una misma persona puede tener varios correos asociados.'),
      ]));
    }
  };
  pintarMensaje();

  const entrarConGoogle = async (credencial) => {
    try {
      await iniciarSesionGoogle(credencial);
      if (!sesion.autenticado) { pintarMensaje(); avisoError('La cuenta de Google no está autorizada.'); return; }
      await cargar();
      avisoOk(`Bienvenido/a ${sesion.nombre || ''}`.trim());
      alEntrar();
    } catch (e) {
      avisoError(e.message || 'No se pudo ingresar con Google.');
    }
  };

  const prepararGoogle = async () => {
    clear(zonaGoogle).append(el('span', { class: 'muted small' }, 'Preparando el ingreso con Google…'));
    if (!url.value.trim()) {
      clear(zonaGoogle).append(el('span', { class: 'chip warn' }, 'Ingresá la URL de la aplicación web'));
      return;
    }
    setSettings({ modo: 'google', apiUrl: url.value.trim() });
    const clientId = await obtenerClientId();
    if (!clientId) {
      clear(zonaGoogle).append(el('div', { class: 'stack' }, [
        el('span', { class: 'chip warn' }, 'El sistema todavía no tiene configurado el ingreso con Google'),
        el('span', { class: 'hint' }, 'Un administrador debe cargar el ID de cliente OAuth en Configuración. Mientras tanto se puede entrar con código de acceso.'),
      ]));
      return;
    }
    try {
      await prepararIngresoGoogle({ clientId, contenedor: zonaGoogle, alRecibirCredencial: entrarConGoogle });
    } catch (e) {
      clear(zonaGoogle).append(el('span', { class: 'chip warn' }, e.message || 'No se pudo preparar el ingreso con Google.'));
    }
  };

  url.addEventListener('change', prepararGoogle);

  tarjeta.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!url.value.trim()) { avisoError('Falta la URL de la aplicación web de Apps Script.'); return; }
    if (!codigo.value.trim()) { avisoError('Ingresá tu código de acceso o usá el ingreso con Google.'); return; }
    setSettings({ modo: 'google', apiUrl: url.value.trim() });
    try {
      await iniciarSesionConCodigo(codigo.value.trim());
      if (!sesion.autenticado) { avisoError('El código de acceso no es válido o está deshabilitado.'); return; }
      await cargar();
      avisoOk(`Bienvenido/a ${sesion.nombre || ''}`.trim());
      alEntrar();
    } catch (e) {
      avisoError(e.message || 'No se pudo iniciar sesión.');
    }
  });

  host.append(tarjeta);
  prepararGoogle();
}

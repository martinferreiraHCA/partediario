/* Pantalla de acceso: se muestra cuando la aplicación trabaja contra Drive y
   todavía no hay un código de acceso válido. */

import { el } from '../utils.js';
import { avisoError, avisoOk } from '../ui.js';
import { getSettings, setSettings } from '../settings.js';
import { iniciarSesion, sesion } from '../sesion.js';
import { cargar } from '../db.js';

export function render(host, { alEntrar }) {
  const ajustes = getSettings();
  const url = el('input', { type: 'url', value: ajustes.apiUrl, placeholder: 'https://script.google.com/macros/s/…/exec' });
  const codigo = el('input', { type: 'text', placeholder: 'Ej.: 4KDF2-8HTQ1', autocomplete: 'off' });

  const entrar = async (ev) => {
    ev.preventDefault();
    if (!url.value.trim()) { avisoError('Falta la URL de la aplicación web de Apps Script.'); return; }
    setSettings({ modo: 'google', apiUrl: url.value.trim() });
    try {
      await iniciarSesion(codigo.value.trim());
      if (!sesion.autenticado) { avisoError('El código de acceso no es válido o está deshabilitado.'); return; }
      await cargar();
      avisoOk(`Bienvenido/a ${sesion.nombre || ''}`.trim());
      alEntrar();
    } catch (e) {
      avisoError(e.message || 'No se pudo iniciar sesión.');
    }
  };

  const form = el('form', { class: 'card card-pad stack', style: 'max-width:520px;margin:6vh auto' }, [
    el('h2', {}, 'Ingresar al sistema'),
    el('p', { class: 'small muted' },
      'La información vive en la carpeta de Google Drive del liceo. Ingresá con el código de acceso que figura en la hoja «Usuarios» del archivo de configuración.'),
    el('label', { class: 'field' }, [el('span', {}, 'URL de la aplicación web'), url]),
    el('label', { class: 'field' }, [el('span', {}, 'Código de acceso'), codigo]),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn btn-primary', type: 'submit' }, 'Entrar'),
      el('button', {
        class: 'btn', type: 'button',
        onclick: async () => {
          setSettings({ modo: 'demo' });
          await cargar();
          alEntrar();
        },
      }, 'Usar modo demostración'),
    ]),
    el('p', { class: 'hint' },
      '¿Todavía no está creada la carpeta? Configurá la conexión y ejecutá la configuración inicial desde Configuración.'),
  ]);
  form.addEventListener('submit', entrar);

  host.append(form);
  setTimeout(() => codigo.focus(), 40);
}

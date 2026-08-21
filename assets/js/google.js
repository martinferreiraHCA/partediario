/*
 * Ingreso con la cuenta de Google (Google Identity Services).
 *
 * El navegador obtiene un ID token firmado por Google y se lo manda al backend
 * de Apps Script, que lo verifica y busca el correo en la hoja «Usuarios».
 * Una misma persona puede tener varios correos asociados.
 */

const URL_GIS = 'https://accounts.google.com/gsi/client';
let cargando = null;

export function cargarGis() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (cargando) return cargando;
  cargando = new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = URL_GIS;
    script.async = true;
    script.onload = () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        resolver(window.google.accounts.id);
      } else {
        rechazar(new Error('Google Identity Services no quedó disponible.'));
      }
    };
    script.onerror = () => {
      cargando = null;
      rechazar(new Error('No se pudo cargar el ingreso con Google (¿sin conexión o bloqueado por el navegador?).'));
    };
    document.head.append(script);
  });
  return cargando;
}

/**
 * Prepara el ingreso con Google y dibuja el botón oficial dentro de `contenedor`.
 * `alRecibirCredencial` recibe el ID token (JWT) cada vez que la persona entra.
 */
export async function prepararIngresoGoogle({ clientId, contenedor, alRecibirCredencial, autoSeleccionar = true }) {
  if (!clientId) throw new Error('Falta el ID de cliente de Google (Client ID).');
  const id = await cargarGis();
  id.initialize({
    client_id: clientId,
    callback: (respuesta) => alRecibirCredencial(respuesta && respuesta.credential),
    auto_select: autoSeleccionar,
    cancel_on_tap_outside: false,
    itp_support: true,
  });
  if (contenedor) {
    contenedor.innerHTML = '';
    id.renderButton(contenedor, {
      theme: 'outline', size: 'large', shape: 'pill',
      text: 'signin_with', logo_alignment: 'left', locale: 'es',
    });
  }
  return id;
}

/** Pide a Google que vuelva a emitir un token (renovación silenciosa si puede). */
export async function pedirCredencial() {
  const id = await cargarGis();
  try { id.prompt(); } catch (e) { console.warn('[google] prompt', e); }
}

export async function olvidarCuenta() {
  try {
    const id = await cargarGis();
    id.disableAutoSelect();
  } catch { /* si no cargó GIS no hay nada que olvidar */ }
}

/* ---------------- permisos para crear instituciones ---------------- */

/**
 * Pide un token de acceso OAuth a Google (Google Identity Services, flujo
 * implícito). Se usa una sola vez, al crear una institución: con él el sitio
 * crea y publica el proyecto de Apps Script dentro de la cuenta que la persona
 * elija. El token vive sólo en memoria y expira en una hora.
 */
export async function pedirTokenAcceso({ clientId, scopes }) {
  await cargarGis();
  if (!window.google.accounts.oauth2) {
    throw new Error('El componente de permisos de Google no está disponible.');
  }
  return new Promise((resolver, rechazar) => {
    let resuelto = false;
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes.join(' '),
      prompt: 'select_account',
      callback: (resp) => {
        resuelto = true;
        if (resp && resp.access_token) resolver(resp.access_token);
        else rechazar(new Error(resp && resp.error_description || 'Google no entregó el permiso.'));
      },
      error_callback: (err) => {
        if (resuelto) return;
        const motivo = err && (err.type === 'popup_closed' || err.type === 'popup_failed_to_open')
          ? 'Se cerró la ventana de Google antes de terminar.'
          : (err && err.message) || 'No se pudo completar el permiso con Google.';
        rechazar(new Error(motivo));
      },
    });
    cliente.requestAccessToken();
  });
}

/* ---------------- utilidades del token ---------------- */

export function decodificarJwt(token) {
  try {
    const carga = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(carga), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Segundos que le quedan al token (0 si venció o no se puede leer). */
export function segundosRestantes(token) {
  const datos = decodificarJwt(token);
  if (!datos || !datos.exp) return 0;
  return Math.max(0, Math.round(datos.exp - Date.now() / 1000));
}

export function tokenVigente(token, margen = 60) {
  return segundosRestantes(token) > margen;
}

export function datosDelToken(token) {
  const datos = decodificarJwt(token) || {};
  return {
    email: String(datos.email || '').toLowerCase(),
    nombre: datos.name || '',
    foto: datos.picture || '',
    exp: Number(datos.exp || 0),
  };
}

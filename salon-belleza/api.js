// ===== CONEXIÓN CON LA BASE DE DATOS (Firebase: Firestore + Authentication) =====
// Usa solo fetch del navegador: no hace falta cargar librerías externas.
// Los datos de firebaseConfig son públicos por diseño: la seguridad la ponen las reglas
// de Firestore (firebase/firestore.rules), que se pegan en la consola de Firebase.
//
// Las funciones de la página y del panel siguen hablando igual que antes (db.leer, db.rpc…):
// este archivo traduce cada pedido a Firestore.

const FIREBASE = {
  apiKey: 'PENDIENTE',
  authDomain: '',
  projectId: 'PENDIENTE',
};
const CORREO_DUENA = 'anfebolivar@gmail.com';
const CLAVE_SESION = 'neivaBelleza.sesionFirebase';

// Para las pruebas se puede apuntar a los emuladores de Firebase (window.FIREBASE_EMULADOR)
const EMULADOR = typeof window !== 'undefined' && window.FIREBASE_EMULADOR ? window.FIREBASE_EMULADOR : null;
if (EMULADOR) Object.assign(FIREBASE, { projectId: EMULADOR.projectId || FIREBASE.projectId, apiKey: EMULADOR.apiKey || 'emulador' });
const URL_AUTH = EMULADOR ? `${EMULADOR.auth}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
const URL_TOKEN = EMULADOR ? `${EMULADOR.auth}/securetoken.googleapis.com/v1/token` : 'https://securetoken.googleapis.com/v1/token';
const RAIZ_DOCS = `projects/${FIREBASE.projectId}/databases/(default)/documents`;
const URL_DOCS = `${EMULADOR ? EMULADOR.firestore : 'https://firestore.googleapis.com'}/v1/${RAIZ_DOCS}`;
const conLlave = (url) => (FIREBASE.apiKey && FIREBASE.apiKey !== 'PENDIENTE' ? `${url}${url.includes('?') ? '&' : '?'}key=${FIREBASE.apiKey}` : url);

// Mensajes claros para los códigos de error
const MENSAJES_ERROR = {
  HORARIO_OCUPADO: 'Ese horario se acaba de ocupar. Elige otro, por favor.',
  FESTIVO: 'Ese día es festivo y el salón está cerrado.',
  DOMINGO: 'Los domingos el salón está cerrado.',
  NO_TRABAJA: 'La profesional no trabaja ese día.',
  FUERA_DE_HORARIO: 'Ese horario está fuera de la jornada de la profesional.',
  BLOQUEADO: 'La profesional no está disponible a esa hora.',
  HORA_PASADA: 'Elige una hora con al menos 30 minutos de anticipación.',
  MUY_LEJOS: 'Solo se puede reservar con hasta 4 meses de anticipación.',
  NOMBRE_INVALIDO: 'Escribe tu nombre completo.',
  TELEFONO_INVALIDO: 'Escribe un número de celular válido.',
  LIMITE_RESERVAS: 'Ya tienes 3 citas ese día. Escríbenos por WhatsApp si necesitas más.',
  PROFESIONAL_NO_HACE_SERVICIO: 'La profesional elegida no hace uno de los servicios. Elige otra o "Sin preferencia".',
  SERVICIO_INVALIDO: 'Uno de los servicios ya no está disponible. Recarga la página.',
  MENOS_DE_24H: 'Faltan menos de 24 horas para tu cita. Para cambiarla escríbenos por WhatsApp.',
  NO_SE_PUEDE_CAMBIAR: 'Esta cita ya no se puede cambiar.',
  NO_EXISTE: 'No encontramos esa cita. Revisa el enlace.',
  CUPON_INVALIDO: 'Ese código de descuento no es válido o ya venció.',
  SALDO_INSUFICIENTE: 'La tarjeta de regalo no tiene saldo suficiente.',
  SIN_PERMISO: 'Tu cuenta no tiene permiso para hacer esto.',
  PERMISSION_DENIED: 'Tu cuenta no tiene permiso para hacer esto.',
  SIN_STOCK: 'Uno de los productos ya no tiene unidades suficientes. Revisa tu carrito.',
  CARRITO_VACIO: 'Tu carrito está vacío.',
  PRODUCTO_INVALIDO: 'Uno de los productos ya no está disponible. Recarga la página.',
  DIRECCION_INVALIDA: 'Escribe la dirección completa para el domicilio.',
  LIMITE_PEDIDOS: 'Ya tienes pedidos pendientes. Escríbenos por WhatsApp si necesitas otro.',
  VALOR_INVALIDO: 'Elige un valor entre $20.000 y $2.000.000.',
  TARJETA_NO_ACTIVA: 'Esa tarjeta todavía no está activa o ya venció.',
  AUN_NO_TERMINADA: 'Podrás opinar cuando termine tu cita.',
  YA_RESENADA: 'Ya dejaste tu opinión de esta cita. ¡Gracias!',
  ESTRELLAS_INVALIDAS: 'Elige de 1 a 5 estrellas.',
  FORMATO_INVALIDO: 'La foto debe ser JPG, PNG o WEBP.',
  ARCHIVO_GRANDE: 'La foto pesa más de 5 MB.',
  SUBIDA_FALLIDA: 'No se pudo subir la foto. Inténtalo de nuevo.',
  PENDIENTE_DE_CONECTAR: 'Esta función está pendiente de conectar: necesita el plan Blaze de Firebase.',
  NO_SE_PUEDE_PAGAR: 'Este pedido o tarjeta ya no se puede pagar en línea.',
  ASISTENTE_NO_DISPONIBLE: 'El asistente no está disponible ahora. Escríbenos por WhatsApp.',
  ESTADO_INVALIDO: 'Ese estado no es válido.',
  YA_EXISTE: 'Ya existe un registro con ese código.',
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Primero confirma tu correo con el enlace que te enviamos (revisa también el correo no deseado).',
  'User already registered': 'Ya existe una cuenta con ese correo. Inicia sesión.',
  WEAK_PASSWORD: 'La contraseña es muy débil. Usa al menos 8 caracteres.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
};

function mensajeError(error) {
  const codigo = String(error && error.message || error).trim();
  return MENSAJES_ERROR[codigo] || 'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.';
}
const fallar = (codigo) => { throw new Error(codigo); };

// ===== CUENTAS DEL EQUIPO (Firebase Authentication) =====
function leerSesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { return null; }
}
function guardarSesion(s) {
  try { s ? localStorage.setItem(CLAVE_SESION, JSON.stringify(s)) : localStorage.removeItem(CLAVE_SESION); } catch (e) { /* sin almacenamiento */ }
}
const sesionDe = (d) => ({
  access_token: d.idToken || d.id_token, refresh_token: d.refreshToken || d.refresh_token,
  expires_at: Math.floor(Date.now() / 1000) + Number(d.expiresIn || d.expires_in || 3600),
});

async function pedirAuth(ruta, cuerpo) {
  const r = await fetch(conLlave(`${URL_AUTH}/${ruta}`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = String((datos.error && datos.error.message) || 'AUTH');
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED/.test(m)) fallar('Invalid login credentials');
    if (/EMAIL_EXISTS/.test(m)) fallar('User already registered');
    fallar(m.split(' ')[0]);
  }
  return datos;
}

async function tokenVigente() {
  let s = leerSesion();
  if (!s) return null;
  if (Date.now() / 1000 > s.expires_at - 60) {
    try {
      const r = await fetch(conLlave(URL_TOKEN), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refresh_token)}`,
      });
      if (!r.ok) throw new Error('AUTH');
      s = sesionDe(await r.json());
      guardarSesion(s);
    } catch (e) {
      if (e instanceof TypeError) throw e; // sin internet: se reintenta después
      guardarSesion(null);
      return null;
    }
  }
  return s.access_token;
}

// Los enlaces de los correos (confirmar cuenta, nueva contraseña) vuelven al panel
const urlRegreso = () => location.origin + location.pathname;

async function iniciarSesion(email, password) {
  const d = await pedirAuth('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  const [usuario] = (await pedirAuth('accounts:lookup', { idToken: d.idToken })).users || [];
  if (!usuario || !usuario.emailVerified) {
    await pedirAuth('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: d.idToken, continueUrl: urlRegreso() }).catch(() => {});
    fallar('Email not confirmed');
  }
  const s = sesionDe(d);
  guardarSesion(s);
  await asegurarPerfil(usuario).catch(() => {});
  return s;
}

// Primera vez que entra: la dueña crea su perfil; las demás quedan esperando aprobación
async function asegurarPerfil(usuario) {
  const uid = usuario.localId;
  if (await leerDoc('perfiles', uid)) return;
  const nombre = usuario.displayName || usuario.email.split('@')[0];
  if (usuario.email.toLowerCase() === CORREO_DUENA) {
    await escribir([crearDoc('perfiles', uid, { user_id: uid, nombre, rol: 'duena', profesional_id: null, creada: ahoraISO() })]);
    return;
  }
  if (!(await leerDoc('solicitudes_acceso', uid))) {
    await escribir([crearDoc('solicitudes_acceso', uid, { user_id: uid, email: usuario.email, nombre, aprobada: false, creada: ahoraISO() })]);
  }
}

async function registrarse(email, password, nombre) {
  const d = await pedirAuth('accounts:signUp', { email, password, returnSecureToken: true });
  if (nombre) await pedirAuth('accounts:update', { idToken: d.idToken, displayName: nombre }).catch(() => {});
  await pedirAuth('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: d.idToken, continueUrl: urlRegreso() });
  return {}; // sin access_token = debe confirmar el correo
}

async function recuperarClave(email) {
  await pedirAuth('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email, continueUrl: urlRegreso() });
}

// Datos del usuario de la sesión actual (vienen dentro del token: sub = id, email)
function usuarioActual() {
  const s = leerSesion();
  if (!s) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; }
}

// Firebase confirma el correo y cambia la contraseña en su propia página; aquí no llega sesión en el enlace
function sesionDesdeEnlace() { return false; }

async function cambiarClave(password) {
  const token = await tokenVigente();
  const d = await pedirAuth('accounts:update', { idToken: token, password, returnSecureToken: true });
  guardarSesion(sesionDe(d));
}

async function cerrarSesion() { guardarSesion(null); }

// ===== FIRESTORE: conversión de datos =====
const PK = {
  config: 'clave', festivos: 'fecha', cupones: 'codigo', tarjetas_regalo: 'codigo', perfiles: 'user_id',
  solicitudes_acceso: 'user_id', reservas: 'token', clientas: 'telefono', pedidos: 'codigo',
};
const pkDe = (tabla) => PK[tabla] || 'id';
const FECHA_HORA = new Set(['inicio', 'fin', 'creada', 'actualizada', 'abierta', 'cerrada', 't']);
const FECHA_HORA_TABLA = { ventas: ['fecha'], inventario_movimientos: ['fecha'], auditoria: ['fecha'] };
const esFechaHora = (tabla, campo) => FECHA_HORA.has(campo) || (FECHA_HORA_TABLA[tabla] || []).includes(campo);
const BOOLEANOS = new Set(['publica', 'aprobada', 'visible', 'activo', 'anulada', 'avisada', 'pagado', 'acepta_promos', 'resenada', 'recordatorio_enviado']);

function aValor(v, fechaHora) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return fechaHora && v ? { timestampValue: new Date(v).toISOString() } : { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => aValor(x)) } };
  return { mapValue: { fields: aCampos(null, v) } };
}
function aCampos(tabla, obj) {
  const campos = {};
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined) campos[k] = aValor(v, tabla && esFechaHora(tabla, k)); });
  return campos;
}
function deValor(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return new Date(v.timestampValue).toISOString();
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(deValor);
  if ('mapValue' in v) return deCampos(v.mapValue.fields || {});
  return null;
}
function deCampos(campos) {
  const o = {};
  Object.entries(campos).forEach(([k, v]) => { o[k] = deValor(v); });
  return o;
}
function deDoc(tabla, doc) {
  const o = deCampos(doc.fields || {});
  const id = decodeURIComponent(doc.name.split('/').pop());
  const pk = pkDe(tabla);
  if (o[pk] === undefined) o[pk] = id;
  if (o.id === undefined) o.id = id;
  o._version = doc.updateTime;
  return o;
}
const sinInternos = (o) => { const c = { ...o }; delete c._version; return c; };
const nombreDoc = (tabla, id) => `${RAIZ_DOCS}/${tabla}/${encodeURIComponent(id)}`;

async function pedirDocs(ruta, opciones = {}) {
  const token = await tokenVigente();
  const r = await fetch(conLlave(`${URL_DOCS}${ruta}`), {
    method: opciones.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  if (r.status === 404 && opciones.permitir404) return null;
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    const estado = (datos && (Array.isArray(datos) ? datos[0] && datos[0].error : datos.error) || {}).status || `HTTP_${r.status}`;
    fallar(estado);
  }
  return datos;
}

async function leerDoc(tabla, id) {
  const d = await pedirDocs(`/${tabla}/${encodeURIComponent(id)}`, { permitir404: true });
  return d ? deDoc(tabla, d) : null;
}
async function leerVarios(tabla, ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return [];
  const r = await pedirDocs(':batchGet', { method: 'POST', body: { documents: unicos.map((id) => nombreDoc(tabla, id)) } });
  return r.filter((x) => x.found).map((x) => deDoc(tabla, x.found));
}

// Escrituras atómicas: todo o nada
const crearDoc = (tabla, id, datos) => ({ update: { name: nombreDoc(tabla, id), fields: aCampos(tabla, datos) }, currentDocument: { exists: false } });
const ponerDoc = (tabla, id, datos) => ({ update: { name: nombreDoc(tabla, id), fields: aCampos(tabla, datos) } });
const cambiarDoc = (tabla, id, cambios, version) => ({
  update: { name: nombreDoc(tabla, id), fields: aCampos(tabla, cambios) },
  updateMask: { fieldPaths: Object.keys(cambios) },
  currentDocument: version ? { updateTime: version } : { exists: true },
});
const sumarCampo = (tabla, id, campo, n) => ({
  transform: { document: nombreDoc(tabla, id), fieldTransforms: [{ fieldPath: campo, increment: { integerValue: String(n) } }] },
});
const borrarDoc = (tabla, id) => ({ delete: nombreDoc(tabla, id) });
async function escribir(escrituras) {
  if (!escrituras.length) return null;
  return pedirDocs(':commit', { method: 'POST', body: { writes: escrituras } });
}
const auditoria = (tabla, accion, registro, detalle = {}) => crearDoc('auditoria', uuid(), {
  fecha: ahoraISO(), usuario: (usuarioActual() || {}).sub || null, tabla, accion, registro_id: registro ? String(registro) : null, detalle,
});

// ===== CONSULTAS (mismo formato que antes: "select=*&estado=eq.x&order=inicio.desc&limit=10") =====
function cumple(x, op, val) {
  const esISO = (s) => typeof s === 'string' && /^\d{4}-\d\d-\d\dT/.test(s);
  const cmp = (s) => {
    if (esISO(x) && esISO(s)) return new Date(x) - new Date(s);
    const y = typeof x === 'number' ? Number(s) : s;
    return x > y ? 1 : x < y ? -1 : 0;
  };
  switch (op) {
    case 'eq': return String(x) === val;
    case 'neq': return String(x) !== val;
    case 'gt': return x != null && cmp(val) > 0;
    case 'gte': return x != null && cmp(val) >= 0;
    case 'lt': return x != null && cmp(val) < 0;
    case 'lte': return x != null && cmp(val) <= 0;
    case 'is': return val === 'null' ? x == null : String(x) === val;
    case 'not': return val === 'is.null' ? x != null : true;
    case 'ilike': { const t = val.replace(/\*/g, '').toLowerCase(); return String(x == null ? '' : x).toLowerCase().includes(t); }
    default: return true;
  }
}
function leerConsulta(qs) {
  const p = new URLSearchParams(qs);
  const filtros = []; let or = null;
  for (const [k, v] of p.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (k === 'or') {
      or = v.slice(1, -1).split(',').map((c) => { const [col, op, ...val] = c.split('.'); return [col, op, val.join('.')]; });
      continue;
    }
    const i = v.indexOf('.');
    filtros.push([k, v.slice(0, i), v.slice(i + 1)]);
  }
  const orden = p.get('order') ? p.get('order').split(',').map((o) => { const [c, dir] = o.split('.'); return [c, dir === 'desc' ? 'desc' : 'asc']; }) : [];
  return { select: p.get('select') || '*', filtros, or, orden, limite: p.get('limit') ? Number(p.get('limit')) : null };
}
function aplicarConsulta(filas, c) {
  let r = filas.filter((f) => c.filtros.every(([k, op, v]) => cumple(f[k], op, v)));
  if (c.or) r = r.filter((f) => c.or.some(([k, op, v]) => cumple(f[k], op, v)));
  if (c.orden.length) {
    r.sort((a, b) => {
      for (const [k, dir] of c.orden) {
        if (a[k] === b[k]) continue;
        if (a[k] == null) return 1; if (b[k] == null) return -1;
        const s = a[k] > b[k] ? 1 : -1;
        return dir === 'desc' ? -s : s;
      }
      return 0;
    });
  }
  return c.limite ? r.slice(0, c.limite) : r;
}
const OPS = { eq: 'EQUAL', gt: 'GREATER_THAN', gte: 'GREATER_THAN_OR_EQUAL', lt: 'LESS_THAN', lte: 'LESS_THAN_OR_EQUAL' };
function valorFiltro(tabla, campo, v) {
  if (BOOLEANOS.has(campo)) return { booleanValue: v === 'true' };
  return aValor(v, esFechaHora(tabla, campo));
}

// Firestore solo filtra lo que puede sin índices especiales; el resto se filtra aquí mismo
async function consultar(tabla, c) {
  let enviar = [];
  let ordenEnviado = null;
  const rangos = c.filtros.filter(([, op]) => ['gt', 'gte', 'lt', 'lte'].includes(op));
  const iguales = c.filtros.filter(([, op]) => op === 'eq');
  const perfil = typeof sesion !== 'undefined' && sesion && sesion.perfil;
  if (perfil && perfil.rol === 'estilista' && ['reservas', 'ventas'].includes(tabla)) {
    enviar = [['profesional_id', 'eq', perfil.profesional_id || '-']];
  } else if (rangos.length) {
    const campo = rangos[0][0];
    enviar = rangos.filter(([k]) => k === campo);
    if (c.orden.length && c.orden[0][0] === campo) ordenEnviado = c.orden[0];
  } else if (iguales.length) {
    enviar = iguales;
  } else if (c.orden.length) {
    ordenEnviado = c.orden[0];
  }
  const consulta = { from: [{ collectionId: tabla }] };
  const condiciones = enviar.map(([k, op, v]) => ({ fieldFilter: { field: { fieldPath: k }, op: OPS[op], value: valorFiltro(tabla, k, v) } }));
  if (condiciones.length === 1) consulta.where = condiciones[0];
  if (condiciones.length > 1) consulta.where = { compositeFilter: { op: 'AND', filters: condiciones } };
  if (ordenEnviado) {
    consulta.orderBy = [{ field: { fieldPath: ordenEnviado[0] }, direction: ordenEnviado[1] === 'desc' ? 'DESCENDING' : 'ASCENDING' }];
    const todoEnviado = c.filtros.every((f) => enviar.includes(f)) && !c.or && c.orden.length === 1;
    if (c.limite && todoEnviado) consulta.limit = c.limite;
  }
  const r = await pedirDocs(':runQuery', { method: 'POST', body: { structuredQuery: consulta } });
  return aplicarConsulta(r.filter((x) => x.document).map((x) => deDoc(tabla, x.document)), c);
}

async function leerTabla(tabla, qs = 'select=*') {
  const c = leerConsulta(qs);
  const pk = pkDe(tabla);
  let filas;
  if (c.filtros.length === 1 && c.filtros[0][1] === 'eq' && [pk, 'id'].includes(c.filtros[0][0]) && !c.or) {
    const doc = await leerDoc(tabla, c.filtros[0][2]);
    filas = doc ? [doc] : [];
  } else {
    filas = await consultar(tabla, c);
  }
  if (tabla === 'reservas' && /clientas\(/.test(c.select) && filas.length) {
    const clientas = await leerVarios('clientas', filas.map((f) => f.clienta_id));
    filas = filas.map((f) => ({ ...f, clientas: clientas.find((x) => x.id === f.clienta_id) || null }));
  }
  return filas.map(sinInternos);
}

// Valores por defecto al crear (como los tenía la base de datos anterior)
const ahoraISO = () => new Date().toISOString();
function valoresPorDefecto(tabla) {
  const uid = (usuarioActual() || {}).sub || null;
  const ahora = ahoraISO();
  return ({
    caja_turnos: { abierta: ahora, abierta_por: uid, cerrada: null, cerrada_por: null, efectivo_contado: null, notas: '', base_inicial: 0 },
    ventas: { fecha: ahora, anulada: false, descuento: 0, propina: 0, usuario: uid, reserva_id: null, clienta_id: null, profesional_id: null },
    gastos: { creada: ahora },
    proveedores: { creada: ahora, telefono: '', contacto: '' },
    inventario_movimientos: { fecha: ahora, nota: '', costo_unitario: null, proveedor_id: null, usuario: uid },
    fichas: { fecha: hoyColombia(), notas: '', formula: '', servicio: '' },
    bloqueos: { creada: ahora, motivo: '', profesional_id: null },
    festivos: { nombre: 'Festivo' },
    config: { publica: false },
    profesionales: { rating: 5, resenas: 0, tono: ['#e8c3b5', '#c98f88'], dias: [1, 2, 3, 4, 5, 6], hora_inicio: '09:00:00', hora_fin: '18:00:00',
      nivel: 'senior', comision_servicio: 0.4, comision_producto: 0.1, bio: null, certificados: [], portafolio: [], activo: true, orden: 99, categorias: [] },
    cupones: { usos: 0, activo: true, creada: ahora, minimo: 0, desde: null, hasta: null, usos_max: null, descripcion: '' },
    galeria: { visible: true, orden: 0, creada: ahora, foto_antes: null, titulo: '', categoria: '', profesional_id: null },
    lista_espera: { avisada: false, creada: ahora },
    clientas: { sellos: 0, puntos: 0, etiquetas: [], alergias: '', notas: '', acepta_promos: false, creada: ahora },
  })[tabla] || { creada: ahora };
}

async function insertarFilas(tabla, filas) {
  const lista = Array.isArray(filas) ? filas : [filas];
  const pk = pkDe(tabla);
  const nuevas = lista.map((f) => {
    const fila = { ...valoresPorDefecto(tabla), ...f };
    if (fila[pk] == null) fila[pk] = pk === 'id' ? uuid() : fallar('FALTA_' + pk);
    if (tabla === 'cupones') fila.codigo = String(fila.codigo).toUpperCase();
    return fila;
  });
  const escrituras = [];
  for (const fila of nuevas) {
    escrituras.push(crearDoc(tabla, fila[pk], fila));
    escrituras.push(...(await efectosAlCrear(tabla, fila)));
  }
  try {
    await escribir(escrituras);
  } catch (e) {
    if (['ALREADY_EXISTS', 'FAILED_PRECONDITION'].includes(e.message)) fallar('YA_EXISTE');
    throw e;
  }
  return nuevas;
}

async function actualizarFilas(tabla, filtro, cambios) {
  const c = leerConsulta(filtro);
  const pk = pkDe(tabla);
  const objetivo = c.filtros.length === 1 && c.filtros[0][1] === 'eq' && [pk, 'id'].includes(c.filtros[0][0])
    ? [await leerDoc(tabla, c.filtros[0][2])].filter(Boolean)
    : await consultar(tabla, c);
  const resultado = [];
  for (const viejo of objetivo) {
    const limpios = { ...cambios };
    delete limpios[pk];
    if (tabla === 'reservas') limpios.actualizada = ahoraISO();
    const nuevo = { ...viejo, ...limpios };
    const escrituras = [cambiarDoc(tabla, viejo[pk], limpios), ...(await efectosAlCambiar(tabla, viejo, nuevo))];
    try { await escribir(escrituras); } catch (e) {
      if (tabla === 'reservas' && ['ALREADY_EXISTS', 'FAILED_PRECONDITION'].includes(e.message)) fallar('HORARIO_OCUPADO');
      throw e;
    }
    resultado.push(sinInternos(nuevo));
  }
  return resultado;
}

async function borrarFilas(tabla, filtro) {
  const c = leerConsulta(filtro);
  const pk = pkDe(tabla);
  const objetivo = c.filtros.length === 1 && c.filtros[0][1] === 'eq' && [pk, 'id'].includes(c.filtros[0][0])
    ? [{ [pk]: c.filtros[0][2] }]
    : await consultar(tabla, c);
  await escribir(objetivo.map((f) => borrarDoc(tabla, f[pk])));
  return null;
}

// ===== AUTOMATISMOS (lo que antes hacían los disparadores de la base de datos) =====
async function efectosAlCrear(tabla, fila) {
  const e = [];
  if (tabla === 'inventario_movimientos') e.push(sumarCampo('productos', fila.producto_id, 'stock', fila.cantidad));
  if (tabla === 'ventas' && !fila.anulada) e.push(...movimientosVenta(fila, -1), auditoria('ventas', 'venta', fila.id, { total: fila.total, metodo: fila.metodo_pago }));
  return e;
}
function movimientosVenta(venta, signo) {
  const e = [];
  (venta.items || []).filter((i) => i.tipo === 'producto').forEach((i) => {
    const cant = signo * (i.cantidad || 1);
    e.push(crearDoc('inventario_movimientos', uuid(), { producto_id: i.id, cantidad: cant, motivo: signo < 0 ? 'venta' : 'anulacion', nota: 'Caja', fecha: ahoraISO(), costo_unitario: null, proveedor_id: null }));
    e.push(sumarCampo('productos', i.id, 'stock', cant));
  });
  // 1 punto por cada $1.000
  if (venta.clienta_id) e.push(sumarCampo('clientas', venta.clienta_id, 'puntos', -signo * Math.floor((venta.total || 0) / 1000)));
  return e;
}

async function efectosAlCambiar(tabla, viejo, nuevo) {
  const e = [];
  if (tabla === 'ventas' && nuevo.anulada && !viejo.anulada) {
    e.push(...movimientosVenta(viejo, 1), auditoria('ventas', 'anular', viejo.id, { total: viejo.total }));
  }
  if (tabla === 'pedidos' && nuevo.estado !== viejo.estado) {
    const descontar = ['listo', 'entregado'].includes(nuevo.estado) && !viejo.stock_descontado;
    const devolver = nuevo.estado === 'cancelado' && viejo.stock_descontado;
    if (descontar || devolver) {
      const signo = descontar ? -1 : 1;
      (viejo.items || []).forEach((i) => {
        e.push(crearDoc('inventario_movimientos', uuid(), { producto_id: i.id, cantidad: signo * i.cantidad, motivo: 'pedido', nota: `Pedido ${viejo.codigo}`, fecha: ahoraISO(), costo_unitario: null, proveedor_id: null }));
        e.push(sumarCampo('productos', i.id, 'stock', signo * i.cantidad));
      });
      e.push(cambiarDoc('pedidos', viejo.codigo, { stock_descontado: descontar }));
    }
  }
  if (tabla === 'reservas') {
    const activa = (x) => !['cancelada', 'no_asistio'].includes(x.estado);
    const mueve = nuevo.inicio !== viejo.inicio || nuevo.fin !== viejo.fin || nuevo.profesional_id !== viejo.profesional_id;
    if (activa(viejo) && !activa(nuevo)) e.push(...liberarHorario(viejo));
    else if (!activa(viejo) && activa(nuevo)) e.push(...apartarHorario(nuevo));
    else if (activa(nuevo) && mueve) e.push(...liberarHorario(viejo, nuevo), ...apartarHorario(nuevo, viejo));
    if (nuevo.estado !== viejo.estado) {
      e.push(auditoria('reservas', 'cambio_panel', viejo.token, { estado: [viejo.estado, nuevo.estado] }));
      if (nuevo.estado === 'terminada') e.push(...(await premiosCitaTerminada(viejo)));
    }
  }
  return e;
}

// Cita terminada: un sello para la clienta y, si es su primera cita y vino referida, 200 puntos para quien la recomendó
async function premiosCitaTerminada(r) {
  const e = [sumarCampo('clientas', r.clienta_id, 'sellos', 1)];
  const cl = await leerDoc('clientas', r.clienta_id).catch(() => null);
  if (cl && cl.referida_por) {
    const anteriores = await consultar('reservas', leerConsulta(`clienta_id=eq.${encodeURIComponent(r.clienta_id)}`)).catch(() => []);
    if (!anteriores.some((x) => x.estado === 'terminada' && x.token !== r.token)) {
      const [quien] = await consultar('clientas', leerConsulta(`codigo_referido=eq.${encodeURIComponent(cl.referida_por)}`)).catch(() => []);
      if (quien && quien.id !== cl.id) e.push(sumarCampo('clientas', quien.id, 'puntos', 200));
    }
  }
  return e;
}

// ===== HORARIOS: casillas de 15 minutos que impiden que dos citas se crucen =====
const MIN_CASILLA = 15;
function casillasDe(profesional, inicioISO, finISO) {
  const paso = MIN_CASILLA * 60e3;
  const fin = new Date(finISO).getTime();
  const lista = [];
  for (let t = Math.floor(new Date(inicioISO).getTime() / paso) * paso; t < fin; t += paso) {
    const d = new Date(t).toISOString();
    lista.push({ id: `${profesional}_${d.slice(0, 16).replace(/[-:T]/g, '')}`, t: d });
  }
  return lista;
}
function apartarHorario(r, antes = null) {
  const viejas = antes ? new Set(casillasDe(antes.profesional_id, antes.inicio, antes.fin).map((c) => c.id)) : new Set();
  return [
    ponerDoc('ocupados', r.token, { profesional_id: r.profesional_id, inicio: r.inicio, fin: r.fin }),
    ...casillasDe(r.profesional_id, r.inicio, r.fin).filter((c) => !viejas.has(c.id))
      .map((c) => crearDoc('casillas', c.id, { reserva: r.token, t: c.t })),
  ];
}
function liberarHorario(r, despues = null) {
  const siguen = despues ? new Set(casillasDe(despues.profesional_id, despues.inicio, despues.fin).map((c) => c.id)) : new Set();
  return [
    ...(despues ? [] : [borrarDoc('ocupados', r.token)]),
    ...casillasDe(r.profesional_id, r.inicio, r.fin).filter((c) => !siguen.has(c.id)).map((c) => borrarDoc('casillas', c.id)),
  ];
}

// ===== AYUDAS =====
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
}
function codigoCorto(n = 6) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const azar = new Uint32Array(n);
  crypto.getRandomValues(azar);
  return [...azar].map((x) => letras[x % letras.length]).join('');
}
function limpiarTelefono(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  if (d.length < 7 || d.length > 12) fallar('TELEFONO_INVALIDO');
  return d;
}
function limpiarNombre(n) {
  const t = String(n || '').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 80) fallar('NOMBRE_INVALIDO');
  return t;
}
const hoyColombia = () => fechaHoraColombia(ahoraISO()).fecha;
const sumarDiasTexto = (fecha, n) => { const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const inicioDiaColombia = (fecha) => new Date(`${fecha}T00:00:00-05:00`).toISOString();
const diaSemana = (fecha) => new Date(fecha + 'T12:00:00Z').getUTCDay();
const minutosHora = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };

async function catalogo() {
  const [servicios, disenos, profesionales, productos, festivos] = await Promise.all(
    ['servicios', 'disenos', 'profesionales', 'productos', 'festivos'].map((t) => leerTabla(t)));
  return { servicios, disenos, profesionales, productos, festivos: new Set(festivos.map((f) => f.fecha)) };
}

// Precio y duración de una combinación de servicios (igual que calcularServicios() en datos.js)
function calcularLista(cat, ids, largo) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 6) fallar('SERVICIO_INVALIDO');
  const items = []; const categorias = new Set(); let minutos = 0, precio = 0;
  ids.forEach((sid) => {
    let p, m, nombre, categoria;
    if (String(sid).startsWith('diseno:')) {
      const d = cat.disenos.find((x) => x.id === sid.slice(7) && x.activo);
      if (!d) fallar('SERVICIO_INVALIDO');
      p = d.precio; m = 60; nombre = 'Manicura ' + d.nombre; categoria = 'unas';
    } else {
      const s = cat.servicios.find((x) => x.id === sid && x.activo);
      if (!s) fallar('SERVICIO_INVALIDO');
      p = s.precio; m = s.minutos; nombre = s.nombre; categoria = s.categoria_id;
      const aj = largo && s.ajustes_largo && s.ajustes_largo[largo];
      if (aj) { p += aj.precio || 0; m += aj.minutos || 0; }
      m += s.limpieza_min || 0;
    }
    items.push({ id: sid, nombre, precio: p, minutos: m });
    categorias.add(categoria); minutos += m; precio += p;
  });
  return { items, minutos, precio, categorias: [...categorias] };
}

async function ocupadosEntre(desdeISO, hastaISO) {
  const [citas, bloqueos] = await Promise.all([
    consultar('ocupados', leerConsulta(`fin=gt.${encodeURIComponent(desdeISO)}`)),
    consultar('bloqueos', leerConsulta(`fin=gt.${encodeURIComponent(desdeISO)}`)),
  ]);
  return [...citas.map((c) => ({ ...c, token: c.id })), ...bloqueos.map((b) => ({ ...b, bloqueo: true }))]
    .filter((x) => x.inicio < hastaISO);
}

// Revisa que la profesional pueda atender en ese horario (lanza el código de error si no)
function validarHorario(cat, ocupados, proId, inicioISO, finISO, ignorar, esClienta) {
  const pro = cat.profesionales.find((p) => p.id === proId && p.activo);
  if (!pro) fallar('PROFESIONAL_NO_HACE_SERVICIO');
  const ahora = Date.now();
  const ini = new Date(inicioISO).getTime();
  if (esClienta) {
    if (ini < ahora + 30 * 60e3) fallar('HORA_PASADA');
    if (ini > ahora + 122 * 864e5) fallar('MUY_LEJOS');
  }
  const a = fechaHoraColombia(inicioISO), b = fechaHoraColombia(finISO);
  const dia = diaSemana(a.fecha);
  if (dia === 0 && !pro.dias.includes(0)) fallar('DOMINGO');
  if (cat.festivos.has(a.fecha)) fallar('FESTIVO');
  if (!pro.dias.includes(dia)) fallar('NO_TRABAJA');
  if (a.minutos < minutosHora(pro.hora_inicio) || b.fecha !== a.fecha || b.minutos > minutosHora(pro.hora_fin)) fallar('FUERA_DE_HORARIO');
  const cruza = (x) => x.inicio < finISO && x.fin > inicioISO;
  if (ocupados.some((x) => x.bloqueo && (x.profesional_id === proId || !x.profesional_id) && cruza(x))) fallar('BLOQUEADO');
  if (ocupados.some((x) => !x.bloqueo && x.profesional_id === proId && x.token !== ignorar && cruza(x))) fallar('HORARIO_OCUPADO');
  return pro;
}

const vistaReserva = (r, cat) => ({
  codigo: r.codigo, token: r.token, estado: r.estado, inicio: r.inicio, fin: r.fin, servicios: r.servicios, productos: r.productos,
  subtotal: r.subtotal, descuento: r.descuento, total: r.total, profesional_id: r.profesional_id,
  profesional: ((cat && cat.profesionales.find((p) => p.id === r.profesional_id)) || {}).nombre || '',
  nombre: r.clienta_nombre || '', codigo_referido: r.codigo_referido || null,
  puede_cambiar: ['pendiente', 'confirmada'].includes(r.estado) && new Date(r.inicio) - Date.now() > 24 * 3600e3,
  resenada: !!r.resenada,
});

// Un intento de escritura que choca con otra cita = ese horario se acaba de ocupar
async function escribirCita(escrituras) {
  try { await escribir(escrituras); } catch (e) {
    if (['ALREADY_EXISTS', 'FAILED_PRECONDITION', 'ABORTED'].includes(e.message)) fallar('HORARIO_OCUPADO');
    throw e;
  }
}

async function obtenerClienta(datos, esPersonal) {
  const id = datos.telefono;
  if (esPersonal) {
    const existe = await leerDoc('clientas', id);
    if (existe) return existe;
  }
  const nueva = {
    id, telefono: id, nombre: datos.nombre, email: datos.email || null, cumpleanos: datos.cumpleanos || null,
    acepta_promos: !!datos.acepta_promos, codigo_referido: codigoCorto(6),
    referida_por: datos.referido ? String(datos.referido).trim().toUpperCase() : null,
    sellos: 0, puntos: 0, etiquetas: [], alergias: '', notas: '', creada: ahoraISO(),
  };
  try {
    await escribir([crearDoc('clientas', id, nueva)]);
    return nueva;
  } catch (e) {
    // Ya existe (o la página no la puede leer): se usa la ficha que ya tiene
    if (['ALREADY_EXISTS', 'FAILED_PRECONDITION', 'PERMISSION_DENIED'].includes(e.message)) return { id, nombre: datos.nombre, codigo_referido: null };
    throw e;
  }
}

async function crearCita(p, { esClienta }) {
  const nombre = limpiarNombre(p.p_nombre);
  const telefono = limpiarTelefono(p.p_telefono);
  const cat = await catalogo();
  const calc = calcularLista(cat, p.p_servicios, p.p_largo);
  const inicio = new Date(p.p_inicio).toISOString();
  const fin = new Date(new Date(inicio).getTime() + calc.minutos * 60e3).toISOString();
  const prods = (p.p_productos || []).map((x) => {
    const prod = cat.productos.find((y) => y.id === x.id && y.activo);
    if (!prod) fallar('PRODUCTO_INVALIDO');
    return { id: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad: Math.max(1, Math.min(10, x.cantidad || 1)) };
  });
  const ocupados = await ocupadosEntre(inicioDiaColombia(fechaHoraColombia(inicio).fecha), inicioDiaColombia(sumarDiasTexto(fechaHoraColombia(inicio).fecha, 1)));
  let proId = p.p_profesional;
  const hace = (pr) => calc.categorias.every((c) => (pr.categorias || []).includes(c));
  if (!proId || proId === 'cualquiera') {
    proId = null;
    for (const pr of cat.profesionales.filter((x) => x.activo && hace(x)).sort((a, b) => a.orden - b.orden)) {
      try { validarHorario(cat, ocupados, pr.id, inicio, fin, null, esClienta); proId = pr.id; break; } catch (e) {
        if (['HORA_PASADA', 'MUY_LEJOS', 'FESTIVO'].includes(e.message)) throw e;
      }
    }
    if (!proId) fallar('HORARIO_OCUPADO');
  } else {
    const pr = cat.profesionales.find((x) => x.id === proId && x.activo);
    if (!pr || !hace(pr)) fallar('PROFESIONAL_NO_HACE_SERVICIO');
    validarHorario(cat, ocupados, proId, inicio, fin, null, esClienta);
  }
  const cl = await obtenerClienta({ nombre, telefono, email: p.p_email, cumpleanos: p.p_cumpleanos, acepta_promos: p.p_acepta_promos, referido: p.p_codigo_referido }, !esClienta);
  const token = uuid();
  const subtotal = calc.precio + prods.reduce((t, x) => t + x.precio * x.cantidad, 0);
  const origen = esClienta ? (['web', 'instagram', 'google', 'whatsapp', 'referido'].includes(p.p_origen) ? p.p_origen : 'web') : 'salon';
  const r = {
    id: token, token, codigo: codigoCorto(6), clienta_id: cl.id, clienta_nombre: nombre.split(' ')[0],
    profesional_id: proId, inicio, fin, servicios: calc.items, productos: prods, largo: p.p_largo || null,
    subtotal, descuento: 0, cupon: null, total: subtotal, estado: esClienta ? 'pendiente' : (p.p_estado || 'confirmada'),
    origen, nota: String(p.p_notas || '').slice(0, 500), recordatorio_enviado: false, recordatorio_error: null,
    resenada: false, creada: ahoraISO(), actualizada: ahoraISO(),
  };
  if (!esClienta && !['pendiente', 'confirmada', 'en_curso', 'terminada'].includes(r.estado)) fallar('ESTADO_INVALIDO');
  await escribirCita([crearDoc('reservas', token, r), ...apartarHorario(r), auditoria('reservas', 'crear', token, { origen })]);
  return { r, cat, cl, nombre };
}

async function reservaPorToken(token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) return null;
  return leerDoc('reservas', token);
}

// ===== LO QUE ANTES ERAN FUNCIONES DE LA BASE DE DATOS =====
const RPC = {
  async horarios_ocupados({ p_desde, p_hasta }) {
    const filas = await ocupadosEntre(inicioDiaColombia(p_desde), inicioDiaColombia(sumarDiasTexto(p_hasta, 1)));
    return filas.map((x) => ({ profesional_id: x.profesional_id || null, inicio: x.inicio, fin: x.fin }));
  },

  async crear_reserva(p) {
    const { r, cat, cl, nombre } = await crearCita(p, { esClienta: true });
    return { ...vistaReserva(r, cat), codigo_referido: cl.codigo_referido || null, nombre };
  },

  async ver_reserva({ p_token }) {
    const r = await reservaPorToken(p_token);
    if (!r) return null;
    const pro = await leerDoc('profesionales', r.profesional_id).catch(() => null);
    return vistaReserva(r, { profesionales: pro ? [pro] : [] });
  },

  async confirmar_asistencia({ p_token }) {
    const r = await reservaPorToken(p_token);
    if (!r) fallar('NO_EXISTE');
    if (!['pendiente', 'confirmada'].includes(r.estado)) fallar('NO_SE_PUEDE_CAMBIAR');
    await escribir([cambiarDoc('reservas', r.token, { estado: 'confirmada', actualizada: ahoraISO() })]);
    return RPC.ver_reserva({ p_token });
  },

  async cancelar_reserva({ p_token }) {
    const r = await reservaPorToken(p_token);
    if (!r) fallar('NO_EXISTE');
    if (!['pendiente', 'confirmada'].includes(r.estado)) fallar('NO_SE_PUEDE_CAMBIAR');
    if (new Date(r.inicio) - Date.now() < 24 * 3600e3) fallar('MENOS_DE_24H');
    await escribir([cambiarDoc('reservas', r.token, { estado: 'cancelada', actualizada: ahoraISO() }), ...liberarHorario(r),
      auditoria('reservas', 'cancelar_clienta', r.token)]);
    return RPC.ver_reserva({ p_token });
  },

  async reprogramar_reserva({ p_token, p_inicio }) {
    const r = await reservaPorToken(p_token);
    if (!r) fallar('NO_EXISTE');
    if (!['pendiente', 'confirmada'].includes(r.estado)) fallar('NO_SE_PUEDE_CAMBIAR');
    if (new Date(r.inicio) - Date.now() < 24 * 3600e3) fallar('MENOS_DE_24H');
    const inicio = new Date(p_inicio).toISOString();
    const fin = new Date(new Date(inicio).getTime() + (new Date(r.fin) - new Date(r.inicio))).toISOString();
    const cat = await catalogo();
    const dia = fechaHoraColombia(inicio).fecha;
    const ocupados = await ocupadosEntre(inicioDiaColombia(dia), inicioDiaColombia(sumarDiasTexto(dia, 1)));
    validarHorario(cat, ocupados, r.profesional_id, inicio, fin, r.token, true);
    const nuevo = { ...r, inicio, fin };
    await escribirCita([
      cambiarDoc('reservas', r.token, { inicio, fin, estado: 'pendiente', actualizada: ahoraISO(), recordatorio_enviado: false }),
      ...liberarHorario(r, nuevo), ...apartarHorario(nuevo, r),
      auditoria('reservas', 'reprogramar_clienta', r.token, { antes: r.inicio, despues: inicio }),
    ]);
    return RPC.ver_reserva({ p_token });
  },

  async unirse_lista_espera({ p_nombre, p_telefono, p_fecha, p_servicio, p_profesional }) {
    const nombre = limpiarNombre(p_nombre); const telefono = limpiarTelefono(p_telefono);
    const hoy = hoyColombia();
    if (!p_fecha || p_fecha < hoy || p_fecha > sumarDiasTexto(hoy, 120)) fallar('MUY_LEJOS');
    await escribir([crearDoc('lista_espera', uuid(), { nombre, telefono, fecha: p_fecha, servicio_id: p_servicio || null,
      profesional_id: p_profesional || null, avisada: false, creada: ahoraISO() })]);
    return { ok: true };
  },

  async validar_cupon({ p_codigo, p_subtotal }) {
    const c = await cuponVigente(p_codigo, p_subtotal);
    return { codigo: c.codigo, descripcion: c.descripcion, descuento: descuentoCupon(c, p_subtotal) };
  },

  async aplicar_cupon({ p_token, p_codigo }) {
    const r = await reservaPorToken(p_token);
    if (!r) fallar('NO_EXISTE');
    if (r.cupon || !['pendiente', 'confirmada'].includes(r.estado)) fallar('CUPON_INVALIDO');
    const c = await cuponVigente(p_codigo, r.subtotal);
    const descuento = descuentoCupon(c, r.subtotal);
    const total = Math.max(0, r.subtotal - descuento);
    await escribir([cambiarDoc('reservas', r.token, { cupon: c.codigo, descuento, total, actualizada: ahoraISO() }), sumarCampo('cupones', c.codigo, 'usos', 1)]);
    return { cupon: c.codigo, descuento, total };
  },

  async dejar_resena({ p_token, p_estrellas, p_texto }) {
    const r = await reservaPorToken(p_token);
    if (!r) fallar('NO_EXISTE');
    if (r.estado !== 'terminada') fallar('AUN_NO_TERMINADA');
    if (!Number.isInteger(p_estrellas) || p_estrellas < 1 || p_estrellas > 5) fallar('ESTRELLAS_INVALIDAS');
    if (r.resenada) fallar('YA_RESENADA');
    await escribir([
      cambiarDoc('reservas', r.token, { resenada: true }),
      crearDoc('resenas', uuid(), {
        nombre: (r.clienta_nombre || 'Clienta').slice(0, 40), servicio: ((r.servicios || [])[0] || {}).nombre || '',
        profesional_id: r.profesional_id, estrellas: p_estrellas, texto: String(p_texto || '').trim().slice(0, 600),
        aprobada: false, reserva_codigo: r.codigo, creada: ahoraISO(),
      }),
    ]);
    return { ok: true };
  },

  async crear_pedido({ p_nombre, p_telefono, p_items, p_entrega, p_direccion, p_notas }) {
    const nombre = limpiarNombre(p_nombre); const telefono = limpiarTelefono(p_telefono);
    if (!Array.isArray(p_items) || !p_items.length) fallar('CARRITO_VACIO');
    if (!['recoger', 'domicilio'].includes(p_entrega)) fallar('DIRECCION_INVALIDA');
    const direccion = String(p_direccion || '').trim();
    if (p_entrega === 'domicilio' && direccion.length < 8) fallar('DIRECCION_INVALIDA');
    const productos = await leerVarios('productos', p_items.map((i) => i.id));
    const items = p_items.map((i) => {
      const prod = productos.find((x) => x.id === i.id && x.activo);
      const cant = Number(i.cantidad) || 1;
      if (!prod || cant < 1 || cant > 20) fallar('PRODUCTO_INVALIDO');
      if (prod.stock < cant) fallar('SIN_STOCK');
      return { id: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad: cant };
    });
    const total = items.reduce((t, i) => t + i.precio * i.cantidad, 0);
    const codigo = codigoCorto(6);
    await escribir([crearDoc('pedidos', codigo, { codigo, nombre, telefono, items, total, estado: 'nuevo', entrega: p_entrega,
      direccion: direccion.slice(0, 200), notas: String(p_notas || '').slice(0, 300), pagado: false, stock_descontado: false, creada: ahoraISO() })]);
    return { codigo, total, items, entrega: p_entrega };
  },

  async solicitar_tarjeta_regalo({ p_valor, p_de, p_para, p_telefono, p_mensaje }) {
    if (!Number.isInteger(p_valor) || p_valor < 20000 || p_valor > 2000000) fallar('VALOR_INVALIDO');
    const de = limpiarNombre(p_de); const para = limpiarNombre(p_para); const telefono = limpiarTelefono(p_telefono);
    const codigo = uuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    const vence = sumarDiasTexto(hoyColombia(), 365);
    await escribir([crearDoc('tarjetas_regalo', codigo, { codigo, valor_inicial: p_valor, saldo: p_valor, de, para, telefono,
      mensaje: String(p_mensaje || '').trim().slice(0, 200), estado: 'pendiente_pago', vence, creada: ahoraISO() })]);
    return { codigo, valor: p_valor, estado: 'pendiente_pago', vence };
  },

  async saldo_tarjeta({ p_codigo }) {
    const codigo = String(p_codigo || '').trim().toUpperCase();
    const t = /^[0-9A-Z]{6,12}$/.test(codigo) ? await leerDoc('tarjetas_regalo', codigo) : null;
    if (!t) fallar('NO_EXISTE');
    return { saldo: t.saldo, estado: t.estado, vence: t.vence, para: t.para };
  },

  async usar_tarjeta({ p_codigo, p_valor }) {
    const t = await leerDoc('tarjetas_regalo', String(p_codigo || '').trim().toUpperCase());
    if (!t || t.estado !== 'activa' || t.vence < hoyColombia()) fallar('TARJETA_NO_ACTIVA');
    if (!(p_valor >= 0) || t.saldo < p_valor) fallar('SALDO_INSUFICIENTE');
    const saldo = t.saldo - p_valor;
    await escribir([cambiarDoc('tarjetas_regalo', t.codigo, { saldo, estado: saldo === 0 ? 'agotada' : t.estado }, t._version),
      auditoria('tarjetas_regalo', 'usar', t.codigo, { valor: p_valor, saldo })]);
    return { saldo };
  },

  async crear_cita_salon(p) {
    const { r } = await crearCita(p, { esClienta: false });
    return r;
  },

  async mover_cita({ p_id, p_inicio, p_profesional }) {
    const r = await leerDoc('reservas', p_id);
    if (!r) fallar('NO_EXISTE');
    if (['cancelada', 'no_asistio', 'terminada'].includes(r.estado)) fallar('NO_SE_PUEDE_CAMBIAR');
    const pro = p_profesional || r.profesional_id;
    const inicio = new Date(p_inicio).toISOString();
    const fin = new Date(new Date(inicio).getTime() + (new Date(r.fin) - new Date(r.inicio))).toISOString();
    const cat = await catalogo();
    const dia = fechaHoraColombia(inicio).fecha;
    const ocupados = await ocupadosEntre(inicioDiaColombia(dia), inicioDiaColombia(sumarDiasTexto(dia, 1)));
    validarHorario(cat, ocupados, pro, inicio, fin, r.token, false);
    const nuevo = { ...r, inicio, fin, profesional_id: pro };
    await escribirCita([
      cambiarDoc('reservas', r.token, { inicio, fin, profesional_id: pro, recordatorio_enviado: false, actualizada: ahoraISO() }),
      ...liberarHorario(r, nuevo), ...apartarHorario(nuevo, r),
      auditoria('reservas', 'mover', r.token, { antes: r.inicio, despues: inicio, profesional: pro }),
    ]);
    return sinInternos(nuevo);
  },

  async aprobar_acceso({ p_user, p_rol, p_profesional }) {
    if (!['duena', 'recepcion', 'estilista'].includes(p_rol)) fallar('ESTADO_INVALIDO');
    const s = await leerDoc('solicitudes_acceso', p_user);
    if (!s) fallar('NO_EXISTE');
    await escribir([
      ponerDoc('perfiles', p_user, { user_id: p_user, nombre: s.nombre, rol: p_rol, profesional_id: p_profesional || null, creada: ahoraISO() }),
      cambiarDoc('solicitudes_acceso', p_user, { aprobada: true }),
      auditoria('perfiles', 'aprobar', p_user, { rol: p_rol }),
    ]);
    return null;
  },

  async comisiones({ p_desde, p_hasta }) {
    const [ventas, profesionales] = await Promise.all([ventasEntre(p_desde, p_hasta), leerTabla('profesionales', 'select=*&order=orden')]);
    const perfil = typeof sesion !== 'undefined' && sesion && sesion.perfil;
    const propias = perfil && perfil.rol === 'estilista' ? profesionales.filter((p) => p.id === perfil.profesional_id) : profesionales;
    return propias.map((p) => {
      let servicios = 0, productos = 0, propinas = 0;
      ventas.forEach((v) => {
        (v.items || []).forEach((i) => {
          if ((i.profesional_id || v.profesional_id) !== p.id) return;
          const valor = (i.precio || 0) * (i.cantidad || 1);
          if (i.tipo === 'producto') productos += valor; else servicios += valor;
        });
        if (v.profesional_id === p.id) propinas += v.propina || 0;
      });
      return { id: p.id, nombre: p.nombre, comision_servicio: p.comision_servicio, comision_producto: p.comision_producto, servicios, productos, propinas };
    });
  },

  async reporte({ p_desde, p_hasta }) {
    const desde = inicioDiaColombia(p_desde), hasta = inicioDiaColombia(sumarDiasTexto(p_hasta, 1));
    const [ventas, citas, gastos, clientas, profesionales, terminadas] = await Promise.all([
      ventasEntre(p_desde, p_hasta),
      consultar('reservas', leerConsulta(`inicio=gte.${encodeURIComponent(desde)}&inicio=lt.${encodeURIComponent(hasta)}`)),
      consultar('gastos', leerConsulta(`fecha=gte.${p_desde}&fecha=lte.${p_hasta}`)),
      leerTabla('clientas', 'select=*'),
      leerTabla('profesionales', 'select=*&order=orden'),
      consultar('reservas', leerConsulta('estado=eq.terminada')),
    ]);
    const suma = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
    const agrupar = (arr, k, f) => arr.reduce((o, x) => { o[k(x)] = (o[k(x)] || 0) + f(x); return o; }, {});
    const activas = citas.filter((c) => !['cancelada', 'no_asistio'].includes(c.estado));
    const porDia = agrupar(ventas, (v) => fechaHoraColombia(v.fecha).fecha, (v) => v.total);
    const top = {};
    activas.forEach((c) => (c.servicios || []).forEach((s) => {
      top[s.nombre] = top[s.nombre] || { nombre: s.nombre, veces: 0, valor: 0 };
      top[s.nombre].veces++; top[s.nombre].valor += s.precio || 0;
    }));
    const pico = {};
    citas.filter((c) => c.estado !== 'cancelada').forEach((c) => {
      const d = new Date(new Date(c.inicio).getTime() - 5 * 3600e3);
      const k = d.getUTCDay() + '-' + d.getUTCHours();
      pico[k] = (pico[k] || 0) + 1;
    });
    const antesDe = new Set(terminadas.filter((r) => r.inicio < desde).map((r) => r.clienta_id));
    return {
      ingresos_total: suma(ventas, (v) => v.total),
      ticket_promedio: ventas.length ? Math.round(suma(ventas, (v) => v.total) / ventas.length) : 0,
      gastos_total: suma(gastos, (g) => g.valor),
      citas_total: citas.length,
      citas_terminadas: citas.filter((c) => c.estado === 'terminada').length,
      canceladas: citas.filter((c) => c.estado === 'cancelada').length,
      no_asistio: citas.filter((c) => c.estado === 'no_asistio').length,
      clientas_nuevas: clientas.filter((c) => c.creada && c.creada >= desde && c.creada < hasta).length,
      clientas_recurrentes: new Set(citas.filter((c) => c.estado === 'terminada' && antesDe.has(c.clienta_id)).map((c) => c.clienta_id)).size,
      ingresos_dia: Object.entries(porDia).sort().map(([dia, total]) => ({ dia, total })),
      por_profesional: profesionales.map((p) => ({
        id: p.id, nombre: p.nombre, ventas: suma(ventas.filter((v) => v.profesional_id === p.id), (v) => v.total),
        citas: citas.filter((c) => c.profesional_id === p.id && c.estado === 'terminada').length,
        minutos_reservados: Math.round(suma(activas.filter((c) => c.profesional_id === p.id), (c) => (new Date(c.fin) - new Date(c.inicio)) / 60000)),
      })),
      servicios_top: Object.values(top).sort((a, b) => b.veces - a.veces).slice(0, 10),
      por_metodo: agrupar(ventas, (v) => v.metodo_pago, (v) => v.total),
      origen: agrupar(citas, (c) => c.origen, () => 1),
      gastos_categoria: agrupar(gastos, (g) => g.categoria, (g) => g.valor),
      horas_pico: Object.entries(pico).map(([k, n]) => { const [dia, hora] = k.split('-').map(Number); return { dia, hora, n }; }),
    };
  },
};

async function ventasEntre(desde, hasta) {
  const filas = await consultar('ventas', leerConsulta(`fecha=gte.${encodeURIComponent(inicioDiaColombia(desde))}&fecha=lt.${encodeURIComponent(inicioDiaColombia(sumarDiasTexto(hasta, 1)))}`));
  return filas.filter((v) => !v.anulada);
}
async function cuponVigente(codigo, subtotal) {
  const cod = String(codigo || '').trim().toUpperCase();
  const c = /^[0-9A-Z_-]{2,30}$/.test(cod) ? await leerDoc('cupones', cod) : null;
  const hoy = hoyColombia();
  if (!c || !c.activo || (c.desde && hoy < c.desde) || (c.hasta && hoy > c.hasta)
    || (c.usos_max != null && c.usos >= c.usos_max) || (subtotal || 0) < (c.minimo || 0)) fallar('CUPON_INVALIDO');
  return c;
}
const descuentoCupon = (c, subtotal) => (c.tipo === 'porcentaje' ? Math.round(subtotal * Math.min(c.valor, 100) / 100) : Math.min(c.valor, subtotal));

// Primera vez con la base de datos vacía: carga servicios, equipo, productos, festivos y datos del salón
async function cargarDatosIniciales() {
  const yaHay = await consultar('categorias', leerConsulta('select=*&limit=1'));
  if (yaHay.length) return 0;
  const escrituras = [];
  Object.entries(DATOS_INICIALES).forEach(([tabla, filas]) => filas.forEach((f) => {
    const fila = { ...f, ...(tabla === 'cupones' ? { creada: ahoraISO() } : {}) };
    escrituras.push(crearDoc(tabla, fila[pkDe(tabla)], fila));
  }));
  for (let i = 0; i < escrituras.length; i += 400) await escribir(escrituras.slice(i, i + 400));
  return escrituras.length;
}

// ===== LO QUE USAN LA PÁGINA Y EL PANEL =====
const db = {
  rpc: async (nombre, params = {}) => {
    if (!RPC[nombre]) fallar('NO_EXISTE');
    return RPC[nombre](params);
  },
  leer: (tabla, consulta = 'select=*') => leerTabla(tabla, consulta),
  insertar: (tabla, filas) => insertarFilas(tabla, filas),
  actualizar: (tabla, filtro, cambios) => actualizarFilas(tabla, filtro, cambios),
  borrar: (tabla, filtro) => borrarFilas(tabla, filtro),
};

// Pagos en línea, WhatsApp y asistente necesitan funciones de servidor (plan Blaze de Firebase)
async function funcionServidor(ruta) {
  if (ruta === '/estado') return { wompi: false, whatsapp: false, asistente: false, plan: 'spark' };
  fallar('PENDIENTE_DE_CONECTAR');
}

// Fotos: se reducen y se guardan dentro de la base de datos (el plan gratis de Firebase no incluye almacenamiento de archivos)
async function subirArchivo(carpeta, archivo) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) fallar('FORMATO_INVALIDO');
  if (archivo.size > 5 * 1024 * 1024) fallar('ARCHIVO_GRANDE');
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = mal;
      i.src = URL.createObjectURL(archivo);
    });
    const lado = 1000;
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala); lienzo.height = Math.round(img.naturalHeight * escala);
    lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
    URL.revokeObjectURL(img.src);
    let calidad = 0.75, url = lienzo.toDataURL('image/jpeg', calidad);
    while (url.length > 350000 && calidad > 0.35) { calidad -= 0.1; url = lienzo.toDataURL('image/jpeg', calidad); }
    return url;
  } catch (e) {
    fallar('SUBIDA_FALLIDA');
  }
}

// Fechas: se guardan en UTC; Colombia es UTC-5 todo el año (sin horario de verano)
function aISOColombia(fechaTexto, hora) {
  const [h, m] = hora.split(':').map(Number);
  return `${fechaTexto}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`;
}
function fechaHoraColombia(iso) {
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
  const dos = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`,
    hora: `${d.getUTCHours()}:${dos(d.getUTCMinutes())}`,
    minutos: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

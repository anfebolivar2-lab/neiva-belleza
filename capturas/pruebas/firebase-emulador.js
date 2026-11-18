// Pruebas de la versión con Firebase contra los emuladores oficiales (Firestore + Authentication),
// con las reglas de seguridad reales de firebase/firestore.rules.
//
// 1) cd salon-belleza/firebase && npx firebase emulators:start --project demo-neiva --only auth,firestore
// 2) node capturas/pruebas/firebase-emulador.js
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROYECTO = 'demo-neiva';
const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const SITIO_DIR = path.resolve(__dirname, '../../salon-belleza');
const foto = (n) => path.resolve(__dirname, '../firebase', n);
const errores = [];
const ok = (cond, texto) => { console.log((cond ? '✔ ' : '✘ ') + texto); if (!cond) errores.push(texto); };

// Servidor local de la página (localhost cuenta como sitio seguro, igual que https)
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const servidor = http.createServer((req, res) => {
  const ruta = path.join(SITIO_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
  if (!ruta.startsWith(SITIO_DIR) || !fs.existsSync(ruta)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta)] || 'application/octet-stream' });
  fs.createReadStream(ruta).pipe(res);
});

async function limpiarEmuladores() {
  await fetch(`${FS}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
}
async function confirmarCorreos() {
  const { oobCodes } = await (await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/oobCodes`)).json();
  for (const c of oobCodes.filter((x) => x.requestType === 'VERIFY_EMAIL')) await fetch(c.oobLink);
}
// Lectura "de administrador" del emulador (salta las reglas) para revisar resultados
async function docAdmin(ruta) {
  const r = await fetch(`${FS}/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`, { headers: { Authorization: 'Bearer owner' } });
  return r.ok ? r.json() : null;
}
const entero = (doc, campo) => Number(doc.fields[campo].integerValue);

// Próximo día (en 3 o más días) que la profesional trabaja y no es festivo
function diaHabil(diasPro, desde = 3) {
  const festivos = new Set(fs.readFileSync(path.join(SITIO_DIR, 'datos.js'), 'utf8').match(/\d{4}-\d\d-\d\d/g));
  for (let i = desde; i < 40; i++) {
    const d = new Date(Date.now() - 5 * 3600e3 + i * 864e5).toISOString().slice(0, 10);
    if (diasPro.includes(new Date(d + 'T12:00:00Z').getUTCDay()) && !festivos.has(d)) return d;
  }
}

(async () => {
  await limpiarEmuladores();
  await new Promise((r) => servidor.listen(5510, r));
  const SITIO = 'http://localhost:5510';
  const browser = await chromium.launch();
  const nuevoContexto = async (vista = { width: 1280, height: 1400 }) => {
    const ctx = await browser.newContext({ viewport: vista, reducedMotion: 'reduce' });
    await ctx.addInitScript(([fs, auth, p]) => { window.FIREBASE_EMULADOR = { firestore: fs, auth, projectId: p }; }, [FS, AUTH, PROYECTO]);
    return ctx;
  };

  // ===== 1. LA DUEÑA CREA SU CUENTA Y SE CARGA EL CATÁLOGO =====
  const ctxDuena = await nuevoContexto();
  const panel = await ctxDuena.newPage();
  panel.on('pageerror', (e) => errores.push('JS panel: ' + e.message));
  await panel.goto(SITIO + '/admin.html');
  await panel.click('[data-modo="registro"]');
  await panel.fill('#acceso-nombre', 'Andrés Bolívar');
  await panel.fill('#acceso-email', 'anfebolivar@gmail.com');
  await panel.fill('#acceso-clave', 'clave-segura-123');
  await panel.click('#boton-acceso');
  await panel.waitForSelector('#aviso-acceso:not([hidden])');
  ok((await panel.textContent('#aviso-acceso')).includes('confirmar'), 'al crear la cuenta pide confirmar el correo');
  await panel.fill('#acceso-clave', 'clave-segura-123');
  await panel.click('#boton-acceso');
  await panel.waitForSelector('#error-acceso:not([hidden])');
  ok((await panel.textContent('#error-acceso')).includes('confirma tu correo'), 'sin confirmar el correo no deja entrar');
  await confirmarCorreos();
  await panel.click('#boton-acceso');
  await panel.waitForSelector('#app:not([hidden])', { timeout: 20000 });
  ok(true, 'la dueña entra al panel después de confirmar el correo');
  const perfil = await docAdmin(`perfiles/${await panel.evaluate(() => usuarioActual().sub)}`);
  ok(perfil && perfil.fields.rol.stringValue === 'duena', 'su perfil quedó como dueña');
  ok(!!(await docAdmin('servicios/corte')) && !!(await docAdmin('cupones/BIENVENIDA')), 'se cargó el catálogo inicial (servicios, cupón de bienvenida)');
  await panel.screenshot({ path: foto('panel-inicio.png') });

  // ===== 2. UNA CLIENTA RESERVA DESDE LA PÁGINA =====
  const ctxClienta = await nuevoContexto();
  const pagina = await ctxClienta.newPage();
  pagina.on('pageerror', (e) => errores.push('JS página: ' + e.message));
  await pagina.goto(SITIO + '/index.html');
  await pagina.waitForFunction(() => ESTADO_CONEXION.cargado, null, { timeout: 20000 });
  ok(await pagina.evaluate(() => ESTADO_CONEXION.conectado), 'la página carga el catálogo desde Firebase');
  ok(await pagina.evaluate(() => CATEGORIAS.length === 4 && PROFESIONALES.length === 7 && PRODUCTOS.length === 6), 'servicios, equipo y productos vienen de la base de datos');
  await pagina.screenshot({ path: foto('pagina-inicio.png') });

  const seccion = await pagina.$('#reservar');
  await pagina.$eval('#reservar', (e) => e.scrollIntoView());
  await pagina.click('[data-servicio="mani-semi"]');
  await pagina.click('#btn-siguiente');
  await pagina.click('[data-profesional="sofia"]');
  await pagina.click('#btn-siguiente');
  await pagina.click('[data-accion="primer-cupo"]');
  const [fechaUI, horaUI] = await pagina.evaluate(() => [estado.fecha, estado.hora]);
  ok(fechaUI && horaUI, `primer cupo libre de Sofía: ${fechaUI} ${horaUI}`);
  await pagina.click('#btn-siguiente');
  await pagina.click('#btn-siguiente');
  await pagina.fill('#nombre', 'Laura Méndez');
  await pagina.fill('#telefono', '310 456 7890');
  await pagina.click('#btn-siguiente');
  await pagina.waitForSelector('.exito', { timeout: 20000 });
  await seccion.screenshot({ path: foto('pagina-reserva-lista.png') });
  const reservaUI = await pagina.evaluate(() => estado.enviada);
  ok(reservaUI && /^[A-Z2-9]{6}$/.test(reservaUI.codigo), 'la cita quedó guardada con código ' + (reservaUI && reservaUI.codigo));
  ok(!!(await docAdmin(`reservas/${reservaUI.token}`)) && !!(await docAdmin(`ocupados/${reservaUI.token}`)), 'en Firestore quedaron la cita y su horario ocupado');
  ok(!!(await docAdmin('clientas/3104567890')), 'se creó la ficha de la clienta (id = su celular)');

  // ===== 3. REGLAS DE NEGOCIO (desde el navegador de la clienta) =====
  const dia = diaHabil([2, 3, 4, 5]); // Sofía y Camila trabajan
  const res = await pagina.evaluate(async (dia) => {
    const intento = async (f) => { try { return { ok: await f() }; } catch (e) { return { error: e.message }; } };
    const base = { p_nombre: 'Carolina Pérez', p_telefono: '3157778899', p_servicios: ['mani-semi'], p_inicio: aISOColombia(dia, '10:00'), p_productos: [] };
    const r = {};
    r.primera = await intento(() => db.rpc('crear_reserva', { ...base, p_profesional: 'sofia' }));
    r.cruce = await intento(() => db.rpc('crear_reserva', { ...base, p_telefono: '3009876543', p_profesional: 'sofia' }));
    r.cualquiera = await intento(() => db.rpc('crear_reserva', { ...base, p_telefono: '3145556677', p_nombre: 'Andrea Gil', p_profesional: 'cualquiera' }));
    // Saltándose la revisión de la página: la base de datos igual rechaza el cruce (casillas ya tomadas)
    r.cruceForzado = await intento(async () => {
      const t = uuid();
      const x = { id: t, token: t, codigo: 'FORZAD', clienta_id: '3009876543', clienta_nombre: 'Intrusa', profesional_id: 'sofia',
        inicio: new Date(aISOColombia(dia, '10:30')).toISOString(), fin: new Date(aISOColombia(dia, '11:30')).toISOString(),
        servicios: [], productos: [], largo: null, subtotal: 0, descuento: 0, cupon: null, total: 0, estado: 'pendiente', origen: 'web',
        nota: '', recordatorio_enviado: false, recordatorio_error: null, resenada: false, creada: ahoraISO(), actualizada: ahoraISO() };
      await escribirCita([crearDoc('reservas', t, x), ...apartarHorario(x)]);
      return 'entró';
    });
    r.festivo = await intento(() => db.rpc('crear_reserva', { ...base, p_profesional: 'sofia', p_inicio: aISOColombia('2026-12-25', '10:00') }));
    r.pasado = await intento(() => db.rpc('crear_reserva', { ...base, p_profesional: 'sofia', p_inicio: new Date(Date.now() + 5 * 60e3).toISOString() }));
    r.noHace = await intento(() => db.rpc('crear_reserva', { ...base, p_profesional: 'andres' }));
    r.telefono = await intento(() => db.rpc('crear_reserva', { ...base, p_telefono: '12', p_profesional: 'sofia' }));
    const token = r.primera.ok && r.primera.ok.token;
    r.ver = await intento(() => db.rpc('ver_reserva', { p_token: token }));
    r.cupon = await intento(() => db.rpc('validar_cupon', { p_codigo: 'bienvenida', p_subtotal: 45000 }));
    r.cuponMalo = await intento(() => db.rpc('validar_cupon', { p_codigo: 'NOEXISTE', p_subtotal: 45000 }));
    r.aplicar = await intento(() => db.rpc('aplicar_cupon', { p_token: token, p_codigo: 'BIENVENIDA' }));
    r.aplicar2 = await intento(() => db.rpc('aplicar_cupon', { p_token: token, p_codigo: 'BIENVENIDA' }));
    r.confirmar = await intento(() => db.rpc('confirmar_asistencia', { p_token: token }));
    r.reprogramar = await intento(() => db.rpc('reprogramar_reserva', { p_token: token, p_inicio: aISOColombia(dia, '14:00') }));
    r.horaLiberada = await intento(() => db.rpc('crear_reserva', { ...base, p_telefono: '3012223344', p_nombre: 'Natalia Vargas', p_profesional: 'sofia', p_inicio: aISOColombia(dia, '10:00') }));
    r.ocupados = await db.rpc('horarios_ocupados', { p_desde: dia, p_hasta: dia });
    r.opinarAntes = await intento(() => db.rpc('dejar_resena', { p_token: token, p_estrellas: 5, p_texto: 'Hola' }));
    r.cancelar = await intento(() => db.rpc('cancelar_reserva', { p_token: r.horaLiberada.ok.token }));
    r.confirmarCancelada = await intento(() => db.rpc('confirmar_asistencia', { p_token: r.horaLiberada.ok.token }));
    r.espera = await intento(() => db.rpc('unirse_lista_espera', { p_nombre: 'Valeria Cruz', p_telefono: '3167778888', p_fecha: dia, p_servicio: 'mani-semi', p_profesional: 'sofia' }));
    r.pedido = await intento(() => db.rpc('crear_pedido', { p_nombre: 'Lucía Ramírez', p_telefono: '3105551234', p_items: [{ id: 'shampoo', cantidad: 2 }], p_entrega: 'domicilio', p_direccion: 'Calle 10 # 5-20, Altico', p_notas: '' }));
    r.sinStock = await intento(() => db.rpc('crear_pedido', { p_nombre: 'Lucía Ramírez', p_telefono: '3105551234', p_items: [{ id: 'aceite-cuticula', cantidad: 20 }], p_entrega: 'recoger' }));
    r.tarjeta = await intento(() => db.rpc('solicitar_tarjeta_regalo', { p_valor: 100000, p_de: 'Carlos Gil', p_para: 'Mamá Gil', p_telefono: '3001234567', p_mensaje: 'Feliz día' }));
    r.saldo = await intento(() => db.rpc('saldo_tarjeta', { p_codigo: r.tarjeta.ok.codigo }));
    r.tarjetaMala = await intento(() => db.rpc('solicitar_tarjeta_regalo', { p_valor: 5000, p_de: 'Carlos Gil', p_para: 'Mamá Gil', p_telefono: '3001234567' }));
    // Lo que una persona sin cuenta NO puede hacer
    r.listarCitas = await intento(() => db.leer('reservas', 'select=*'));
    r.leerClientas = await intento(() => db.leer('clientas', 'select=*'));
    r.leerVentas = await intento(() => db.leer('ventas', 'select=*'));
    r.terminarSola = await intento(() => escribir([cambiarDoc('reservas', token, { estado: 'terminada' })]));
    r.cambiarPrecio = await intento(() => escribir([cambiarDoc('servicios', 'corte', { precio: 1 })]));
    r.resenaPublicada = await intento(() => escribir([crearDoc('resenas', uuid(), { nombre: 'Falsa', servicio: 'x', estrellas: 5, texto: 'x', aprobada: true })]));
    r.sellosGratis = await intento(() => escribir([crearDoc('clientas', '3110000000', { id: '3110000000', telefono: '3110000000', nombre: 'Tramposa', sellos: 9, puntos: 0, etiquetas: [], alergias: '', notas: '' })]));
    r.token = token;
    return r;
  }, dia);
  ok(res.primera.ok && res.primera.ok.profesional === 'Sofía Martínez', 'reserva con Sofía a las 10:00');
  ok(res.cruce.error === 'HORARIO_OCUPADO', 'otra clienta a la misma hora con Sofía → HORARIO_OCUPADO');
  ok(res.cualquiera.ok && res.cualquiera.ok.profesional_id === 'camila', '"Sin preferencia" asigna a Camila, la otra manicurista libre');
  ok(res.cruceForzado.error === 'HORARIO_OCUPADO', 'aunque alguien se salte la página, Firestore no deja cruzar citas → ' + JSON.stringify(res.cruceForzado));
  ok(res.festivo.error === 'FESTIVO', 'el 25 de diciembre está cerrado → FESTIVO');
  ok(res.pasado.error === 'HORA_PASADA', 'menos de 30 minutos de anticipación → HORA_PASADA');
  ok(res.noHace.error === 'PROFESIONAL_NO_HACE_SERVICIO', 'Andrés no hace manicura → aviso');
  ok(res.telefono.error === 'TELEFONO_INVALIDO', 'celular inválido → aviso');
  ok(res.ver.ok && res.ver.ok.puede_cambiar === true && res.ver.ok.nombre === 'Carolina', '"Mi cita" muestra la cita y deja cambiarla');
  ok(res.cupon.ok && res.cupon.ok.descuento === 4500, 'cupón BIENVENIDA = $4.500 de descuento sobre $45.000');
  ok(res.cuponMalo.error === 'CUPON_INVALIDO', 'cupón que no existe → aviso');
  ok(res.aplicar.ok && res.aplicar.ok.total === 40500, 'el cupón deja la cita en $40.500');
  ok(res.aplicar2.error === 'CUPON_INVALIDO', 'el cupón no se puede aplicar dos veces a la misma cita');
  ok(res.confirmar.ok && res.confirmar.ok.estado === 'confirmada', 'la clienta confirma su asistencia');
  ok(res.reprogramar.ok && new Date(new Date(res.reprogramar.ok.inicio).getTime() - 5 * 3600e3).toISOString().slice(11, 16) === '14:00', 'la clienta cambia su cita a las 2:00 p.m.');
  ok(res.horaLiberada.ok, 'al moverla, las 10:00 quedan libres para otra clienta');
  ok(res.ocupados.length === 3, 'la agenda pública muestra 3 horarios ocupados ese día (sin datos personales)');
  ok(res.opinarAntes.error === 'AUN_NO_TERMINADA', 'no se puede opinar antes de la cita');
  ok(res.cancelar.ok && res.cancelar.ok.estado === 'cancelada', 'la clienta cancela con más de 24 horas');
  ok(res.confirmarCancelada.error === 'NO_SE_PUEDE_CAMBIAR', 'una cita cancelada ya no se puede confirmar');
  ok(res.espera.ok, 'lista de espera');
  ok(res.pedido.ok && res.pedido.ok.total === 64000, 'pedido de la tienda: 2 shampoos = $64.000');
  ok(res.sinStock.error === 'SIN_STOCK', 'pedir más unidades de las que hay → SIN_STOCK');
  ok(res.tarjeta.ok && res.saldo.ok && res.saldo.ok.estado === 'pendiente_pago', 'tarjeta de regalo pedida y su saldo se puede consultar');
  ok(res.tarjetaMala.error === 'VALOR_INVALIDO', 'tarjeta de $5.000 → valor inválido');
  ok(res.listarCitas.error === 'PERMISSION_DENIED', 'sin cuenta no se pueden listar las citas de otras');
  ok(res.leerClientas.error === 'PERMISSION_DENIED', 'sin cuenta no se ven los datos de las clientas');
  ok(res.leerVentas.error === 'PERMISSION_DENIED', 'sin cuenta no se ve la caja');
  ok(res.terminarSola.error === 'PERMISSION_DENIED', 'una clienta no puede marcar su cita como terminada');
  ok(res.cambiarPrecio.error === 'PERMISSION_DENIED', 'nadie de afuera puede cambiar precios');
  ok(res.resenaPublicada.error === 'PERMISSION_DENIED', 'nadie puede publicar una opinión sin revisión');
  ok(res.sellosGratis.error === 'PERMISSION_DENIED', 'nadie se puede regalar sellos');

  // "Mi cita" en pantalla
  const cita = await ctxClienta.newPage();
  cita.on('pageerror', (e) => errores.push('JS cita: ' + e.message));
  await cita.goto(`${SITIO}/cita.html?t=${res.token}`);
  await cita.waitForSelector('text=Carolina', { timeout: 15000 }).catch(() => {});
  await cita.screenshot({ path: foto('mi-cita.png'), fullPage: true });
  ok((await cita.textContent('body')).includes('Manicura semipermanente'), '"Mi cita" abre con el enlace secreto');

  // ===== 4. EL PANEL DEL SALÓN =====
  const adm = await panel.evaluate(async ({ token, tarjeta }) => {
    const intento = async (f) => { try { return { ok: await f() }; } catch (e) { return { error: e.message }; } };
    const r = {};
    const hoy = hoyColombia();
    r.citas = await intento(() => db.leer('reservas', `select=*,clientas(id,nombre,telefono,alergias,etiquetas,notas)&inicio=gte.${encodeURIComponent(new Date().toISOString())}&order=inicio`));
    r.conClienta = r.citas.ok && r.citas.ok.every((c) => c.clientas && c.clientas.nombre);
    r.terminar = await intento(() => db.actualizar('reservas', `id=eq.${token}`, { estado: 'terminada' }));
    r.clienta = (await db.leer('clientas', 'select=*&id=eq.3157778899'))[0];
    r.venta = await intento(() => db.insertar('ventas', { turno_id: null, reserva_id: token, clienta_id: '3157778899', profesional_id: 'sofia',
      items: [{ tipo: 'servicio', id: 'mani-semi', nombre: 'Manicura semipermanente', precio: 45000, cantidad: 1 },
              { tipo: 'producto', id: 'aceite-cuticula', nombre: 'Aceite de cutícula', precio: 22000, cantidad: 2 }],
      subtotal: 89000, descuento: 4500, propina: 5000, total: 89500, metodo_pago: 'nequi' }));
    r.stock = (await db.leer('productos', 'select=*&id=eq.aceite-cuticula'))[0].stock;
    r.puntos = (await db.leer('clientas', 'select=*&id=eq.3157778899'))[0].puntos;
    r.compra = await intento(() => db.insertar('inventario_movimientos', { producto_id: 'aceite-cuticula', cantidad: 10, motivo: 'compra', nota: 'Pedido', costo_unitario: 9000, proveedor_id: null }));
    r.stock2 = (await db.leer('productos', 'select=*&id=eq.aceite-cuticula'))[0].stock;
    r.anular = await intento(() => db.actualizar('ventas', `id=eq.${r.venta.ok[0].id}`, { anulada: true }));
    r.stock3 = (await db.leer('productos', 'select=*&id=eq.aceite-cuticula'))[0].stock;
    r.activar = await intento(() => db.actualizar('tarjetas_regalo', `codigo=eq.${tarjeta}`, { estado: 'activa' }));
    r.usar = await intento(() => db.rpc('usar_tarjeta', { p_codigo: tarjeta, p_valor: 30000 }));
    r.usarDeMas = await intento(() => db.rpc('usar_tarjeta', { p_codigo: tarjeta, p_valor: 900000 }));
    const manana = (() => { for (let i = 2; i < 20; i++) { const d = new Date(Date.now() - 5 * 3600e3 + i * 864e5).toISOString().slice(0, 10); const w = new Date(d + 'T12:00:00Z').getUTCDay(); if (w >= 1 && w <= 6 && !FESTIVOS.has(d)) return d; } })();
    r.salon = await intento(() => db.rpc('crear_cita_salon', { p_nombre: 'Juliana Torres', p_telefono: '3201112233', p_servicios: ['corte'], p_profesional: 'andres', p_inicio: aISOColombia(manana, '12:00'), p_largo: 'corto', p_notas: '', p_estado: 'confirmada' }));
    r.salon2 = await intento(() => db.rpc('crear_cita_salon', { p_nombre: 'Diana Rojas', p_telefono: '3186665544', p_servicios: ['corte'], p_profesional: 'andres', p_inicio: aISOColombia(manana, '15:00'), p_largo: 'corto', p_notas: '', p_estado: 'confirmada' }));
    r.mover = await intento(() => db.rpc('mover_cita', { p_id: r.salon.ok.id, p_inicio: aISOColombia(manana, '13:00'), p_profesional: 'andres' }));
    r.moverEncima = await intento(() => db.rpc('mover_cita', { p_id: r.salon.ok.id, p_inicio: aISOColombia(manana, '15:00'), p_profesional: 'andres' }));
    r.bloqueo = await intento(() => db.insertar('bloqueos', { profesional_id: 'andres', inicio: new Date(aISOColombia(manana, '17:00')).toISOString(), fin: new Date(aISOColombia(manana, '18:00')).toISOString(), motivo: 'Almuerzo' }));
    r.moverBloqueo = await intento(() => db.rpc('mover_cita', { p_id: r.salon.ok.id, p_inicio: aISOColombia(manana, '17:00'), p_profesional: 'andres' }));
    const codigoPedido = (await db.leer('pedidos', 'select=*'))[0].codigo;
    r.pedidoListo = await intento(() => db.actualizar('pedidos', `codigo=eq.${codigoPedido}`, { estado: 'listo' }));
    r.stockShampoo = (await db.leer('productos', 'select=*&id=eq.shampoo'))[0].stock;
    r.cupon = await intento(() => db.insertar('cupones', { codigo: 'amigas20', descripcion: '20% amigas', tipo: 'porcentaje', valor: 20, minimo: 50000 }));
    r.config = await intento(() => db.insertar('config', { clave: 'plantillas', valor: { recordatorio: 'Hola {nombre}' }, publica: false }).catch(() => db.actualizar('config', 'clave=eq.plantillas', { valor: { recordatorio: 'Hola {nombre}' } })));
    r.festivo = await intento(() => db.insertar('festivos', { fecha: '2027-02-14', nombre: 'Cerrado por inventario' }));
    r.gasto = await intento(() => db.insertar('gastos', { fecha: hoy, categoria: 'insumos', valor: 120000, metodo_pago: 'efectivo', descripcion: 'Esmaltes' }));
    r.reporte = await intento(() => db.rpc('reporte', { p_desde: hoy.slice(0, 8) + '01', p_hasta: hoy }));
    r.comisiones = await intento(() => db.rpc('comisiones', { p_desde: hoy.slice(0, 8) + '01', p_hasta: hoy }));
    r.historial = await intento(() => db.leer('auditoria', 'select=*&order=fecha.desc&limit=100'));
    r.precio = await intento(() => db.actualizar('servicios', 'id=eq.corte', { precio: 48000 }));
    r.espera = await intento(() => db.leer('lista_espera', `select=*&fecha=gte.${hoy}&order=fecha,creada`));
    r.pedidos = await intento(() => db.leer('pedidos', 'select=*&order=creada.desc&limit=60'));
    return r;
  }, { token: res.token, tarjeta: res.tarjeta.ok.codigo });
  ok(adm.citas.ok && adm.citas.ok.length >= 3 && adm.conClienta, `la agenda del panel trae ${adm.citas.ok && adm.citas.ok.length} citas con los datos de cada clienta`);
  ok(adm.terminar.ok && adm.clienta.sellos === 1, 'al terminar la cita, la clienta gana su sello');
  ok(adm.venta.ok && adm.stock === 1 && adm.puntos === 89, 'venta en caja: descuenta 2 aceites del stock (3 → 1) y suma 89 puntos');
  ok(adm.compra.ok && adm.stock2 === 11, 'compra de 10 aceites al inventario: stock 11');
  ok(adm.anular.ok && adm.stock3 === 13, 'anular la venta devuelve los 2 aceites: stock 13');
  ok(adm.activar.ok && adm.usar.ok && adm.usar.ok.saldo === 70000, 'tarjeta de regalo activada y cobrada: saldo $70.000');
  ok(adm.usarDeMas.error === 'SALDO_INSUFICIENTE', 'cobrar más del saldo → aviso');
  ok(adm.salon.ok && adm.salon2.ok, 'citas creadas desde el panel');
  ok(adm.mover.ok, 'mover una cita en la agenda');
  ok(adm.moverEncima.error === 'HORARIO_OCUPADO', 'moverla encima de otra cita → HORARIO_OCUPADO');
  ok(adm.bloqueo.ok && adm.moverBloqueo.error === 'BLOQUEADO', 'bloquear el almuerzo y que nadie quede encima → BLOQUEADO');
  ok(adm.pedidoListo.ok && adm.stockShampoo === 18, 'pedido marcado listo: descuenta 2 shampoos del stock (20 → 18)');
  ok(adm.cupon.ok && adm.config.ok && adm.festivo.ok && adm.gasto.ok && adm.precio.ok, 'crear cupón, guardar mensajes, festivo, gasto y cambiar precio');
  ok(adm.reporte.ok && adm.reporte.ok.ingresos_total === 0 && adm.reporte.ok.gastos_total === 120000 && adm.reporte.ok.citas_total >= 1, 'reporte del mes (sin ventas activas porque se anuló, gasto $120.000)');
  ok(adm.comisiones.ok && adm.comisiones.ok.length === 7, 'comisiones por profesional');
  ok(adm.historial.ok && adm.historial.ok.some((h) => h.accion === 'cancelar_clienta') && adm.historial.ok.some((h) => h.accion === 'cambio_panel'), `historial de cambios (${adm.historial.ok && adm.historial.ok.length} registros)`);
  ok(adm.espera.ok && adm.espera.ok.length === 1 && adm.pedidos.ok && adm.pedidos.ok.length === 1, 'lista de espera y pedidos se ven en el panel');

  // Opinión verificada después de la cita y moderación
  const op = await pagina.evaluate(async (token) => {
    const intento = async (f) => { try { return { ok: await f() }; } catch (e) { return { error: e.message }; } };
    return {
      opinar: await intento(() => db.rpc('dejar_resena', { p_token: token, p_estrellas: 5, p_texto: 'Me encantó, súper delicada.' })),
      repetir: await intento(() => db.rpc('dejar_resena', { p_token: token, p_estrellas: 4, p_texto: 'Otra vez' })),
      publicas: await db.leer('resenas', 'select=nombre,servicio,estrellas,texto,creada&aprobada=eq.true&order=creada.desc&limit=30'),
    };
  }, res.token);
  ok(op.opinar.ok && op.repetir.error === 'YA_RESENADA' && op.publicas.length === 0, 'la clienta opina una sola vez y la opinión espera revisión');
  const aprobada = await panel.evaluate(async () => {
    const [r] = await db.leer('resenas', 'select=*&order=creada.desc&limit=100');
    await db.actualizar('resenas', `id=eq.${r.id}`, { aprobada: true });
    return r.texto;
  });
  const publicas = await pagina.evaluate(() => db.leer('resenas', 'select=nombre,servicio,estrellas,texto,creada&aprobada=eq.true&order=creada.desc&limit=30'));
  ok(publicas.length === 1 && publicas[0].texto === aprobada, 'cuando la dueña la aprueba, la opinión sale en la página');

  // ===== 5. EQUIPO: RECEPCIÓN Y ESTILISTA =====
  const ctxSofia = await nuevoContexto();
  const ps = await ctxSofia.newPage();
  ps.on('pageerror', (e) => errores.push('JS estilista: ' + e.message));
  await ps.goto(SITIO + '/admin.html');
  await ps.click('[data-modo="registro"]');
  await ps.fill('#acceso-nombre', 'Sofía Martínez');
  await ps.fill('#acceso-email', 'sofia@neivabelleza.co');
  await ps.fill('#acceso-clave', 'clave-de-sofia-1');
  await ps.click('#boton-acceso');
  await ps.waitForSelector('#aviso-acceso:not([hidden])');
  await confirmarCorreos();
  await ps.fill('#acceso-clave', 'clave-de-sofia-1');
  await ps.click('#boton-acceso');
  await ps.waitForSelector('#pantalla-pendiente:not([hidden])', { timeout: 15000 });
  ok(true, 'una cuenta nueva del equipo queda esperando aprobación');
  const uidSofia = await ps.evaluate(() => usuarioActual().sub);
  const aprob = await panel.evaluate(async (uid) => {
    const pendientes = await db.leer('solicitudes_acceso', 'select=*&aprobada=eq.false&order=creada');
    await db.rpc('aprobar_acceso', { p_user: uid, p_rol: 'estilista', p_profesional: 'sofia' });
    return pendientes.length;
  }, uidSofia);
  ok(aprob === 1, 'la dueña ve la solicitud y la aprueba como estilista de Sofía');
  await ps.reload();
  await ps.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  const est = await ps.evaluate(async () => {
    const intento = async (f) => { try { return { ok: await f() }; } catch (e) { return { error: e.message }; } };
    return {
      citas: await intento(() => db.leer('reservas', `select=*,clientas(id,nombre,telefono,alergias,etiquetas,notas)&inicio=gte.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}&order=inicio`)),
      caja: await intento(() => db.leer('caja_turnos', 'select=*')),
      precios: await intento(() => db.actualizar('servicios', 'id=eq.corte', { precio: 1000 })),
      comisiones: await intento(() => db.rpc('comisiones', { p_desde: '2026-01-01', p_hasta: '2027-12-31' })),
    };
  });
  ok(est.citas.ok && est.citas.ok.every((c) => c.profesional_id === 'sofia'), `la estilista solo ve sus propias citas (${est.citas.ok && est.citas.ok.length})`);
  ok(est.caja.error === 'PERMISSION_DENIED' && est.precios.error === 'PERMISSION_DENIED', 'la estilista no ve la caja ni cambia precios');
  ok(est.comisiones.ok && est.comisiones.ok.length === 1 && est.comisiones.ok[0].id === 'sofia', 'la estilista ve solo sus comisiones');
  await ps.screenshot({ path: foto('panel-estilista.png') });

  // Vistas del panel de la dueña con datos reales
  for (const [seccionPanel, archivo] of [['agenda', 'panel-agenda.png'], ['clientas', 'panel-clientas.png'], ['caja', 'panel-caja.png'], ['reportes', 'panel-reportes.png'], ['config', 'panel-config.png']]) {
    await panel.evaluate((s) => { location.hash = '#' + s; }, seccionPanel);
    await panel.waitForTimeout(1500);
    await panel.screenshot({ path: foto(archivo) });
  }

  ok(!errores.some((e) => e.startsWith('JS')), 'sin errores de JavaScript en la página ni en el panel');
  console.log(`\n${errores.length ? '✘ ' + errores.length + ' fallas:\n  ' + errores.join('\n  ') : '✔ Todo pasó'}`);
  await browser.close();
  servidor.close();
  process.exit(errores.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

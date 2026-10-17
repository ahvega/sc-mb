// Pruebas unitarias de backend/backend-inscripciones.gs corriendo en Node con mocks
// de los servicios de Apps Script (gas-mocks.js). Sin dependencias externas.
//
//   node --test backend/tests/
//
// Cubren lo que toca la hoja: preinscripción (fila PENDIENTE), pago de prueba,
// verificación manual vía alEditarHoja, flujo de carné de estudiante y ventanas de tarifa.

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./gas-mocks');

const DATOS = {
  nombre: 'Ana Prueba', correo: 'ana@test.hn', whatsapp: '+504 9999-8888', ciudad: 'San Pedro Sula',
  ocupacion: 'Filmmaker', experiencia: 'Intermedia (1 a 3 años)', talla: 'M',
  comoSeEntero: 'Instagram', restricciones: '', comunicaciones: true,
};

const post = (env, body) => env.json(env.ctx.doPost({ postData: { contents: JSON.stringify(body) } }));

// ---------- preinscripcion (botón PayPal: guardar antes de cobrar) ----------

test('preinscripcion crea la fila con Referencia de pago = PENDIENTE y avisa una vez', () => {
  const env = crearEntorno();
  const res = env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS }));
  assert.equal(res.ok, true);

  const h = env.hoja('Inscritos');
  assert.equal(h.getLastRow(), 2);
  assert.equal(h.getRange(2, env.colIndex('Inscritos', 'Referencia de pago')).getValue(), 'PENDIENTE');
  assert.equal(h.getRange(2, env.colIndex('Inscritos', 'Correo')).getValue(), 'ana@test.hn');
  assert.equal(env.correos.length, 1);
  assert.match(env.correos[0].subject, /Recibimos tus datos/);
});

test('segunda preinscripción del mismo correo crea otra fila pero no repite el correo', () => {
  const env = crearEntorno();
  env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS });
  env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS });

  const h = env.hoja('Inscritos');
  assert.equal(h.getLastRow(), 3); // la página es pública: fila nueva, no se sobrescribe
  assert.equal(env.correos.length, 1);
  assert.equal(h.getRange(3, env.colIndex('Inscritos', 'Correo enviado')).getValue(), 'No (repetido)');
});

test('preinscripcion rechaza si faltan campos o la tarifa está vencida', () => {
  const env = crearEntorno();
  const res = env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: { correo: 'x@x.hn' } }));
  assert.equal(res.ok, false);
  assert.equal(env.hoja('Inscritos').getLastRow(), 1);

  env.setHoy('2026-11-10'); // Early Bird cerró el 5-nov
  const res2 = env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS }));
  assert.equal(res2.ok, false);
  assert.match(res2.error, /ya no está disponible/);
});

test('la tarifa de estudiante exige un código de carné aprobado', () => {
  const env = crearEntorno();
  const res = env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'estudiante', datos: DATOS }));
  assert.equal(res.ok, false);
  assert.match(res.error, /carné aprobado/);
});

test('los pagos PENDIENTE no descuentan cupo (documenta el comportamiento actual)', () => {
  const env = crearEntorno();
  for (let i = 0; i < 45; i++) {
    env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: { ...DATOS, correo: 'p' + i + '@t.hn' } });
  }
  const res = env.json(env.ctx.doGet({ parameter: {} }));
  assert.equal(res.cuposDisponibles, 40); // nadie ha pagado: los 40 cupos siguen libres
});

test('limpio defiende la hoja contra valores que empiezan como fórmula', () => {
  const env = crearEntorno();
  env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: { ...DATOS, nombre: '=1+1' } });
  const h = env.hoja('Inscritos');
  assert.equal(h.getRange(2, env.colIndex('Inscritos', 'Nombre (diploma y gafete)')).getValue(), "'=1+1");
});

// ---------- doPost: la ruta legacy de cobro directo se retiró (#20) ----------

test('doPost sin acción reconocida no cobra ni registra (ruta legacy retirada)', () => {
  const env = crearEntorno();
  const res = post(env, { pago: { pasarela: 'prueba', referencia: 'ORD-1' }, tarifa: 'preventa', datos: DATOS });
  assert.equal(res.ok, false);
  assert.equal(env.hoja('Inscritos').getLastRow(), 1);
  assert.equal(env.correos.length, 0);
});

// ---------- Edición manual de la celda ya no aprueba ni envía bienvenida ----------

test('escribir la transacción a mano queda marcado como edición sin verificación, sin bienvenida', () => {
  const env = crearEntorno();
  env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS });
  assert.equal(env.correos.length, 1); // correo "datos recibidos"

  const h = env.hoja('Inscritos');
  const cRef = env.colIndex('Inscritos', 'Referencia de pago');
  h.getRange(2, cRef).setValue('PAYPAL-9X8'); // operador escribe la celda, como antes
  env.ctx.alEditarHoja(env.edicion(h, 2, cRef));

  // No hay bienvenida: el pago sigue Pendiente hasta confirmarlo desde el menú
  assert.equal(env.correos.length, 1);
  assert.match(String(h.getRange(2, env.colIndex('Inscritos', 'Estado de gestión')).getValue()), /sin verificación/);
  assert.equal(h.getRange(2, env.colIndex('Inscritos', 'Estatus de Pago')).getValue(), 'Pendiente');
  // La edición quedó auditada
  const aud = env.hoja('Auditoría');
  assert.ok(aud.getLastRow() >= 2);
});

test('editar otra columna no dispara correos', () => {
  const env = crearEntorno();
  env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS });
  const h = env.hoja('Inscritos');
  env.ctx.alEditarHoja(env.edicion(h, 2, env.colIndex('Inscritos', 'Notas')));
  assert.equal(env.correos.length, 1); // solo el de "datos recibidos"
});

// ---------- Flujo de estudiante ----------

test('carné queda Pendiente sin clave de Claude; aprobación manual genera código y habilita preinscripción', () => {
  const env = crearEntorno(); // sin ANTHROPIC_API_KEY: no hay revisión automática
  const b64 = Buffer.from('imagen-falsa').toString('base64');
  const res = env.json(env.ctx.solicitudEstudiante({
    accion: 'solicitudEstudiante', datos: DATOS, institucion: 'UNITEC',
    carne: { nombre: 'carne.png', tipo: 'image/png', base64: b64 },
  }));
  assert.equal(res.ok, true);
  assert.equal(res.estado, 'Pendiente');
  assert.equal(env.archivos.length, 1); // foto guardada en Drive
  assert.equal(env.correos.length, 2);  // aviso al estudiante + aviso al equipo

  // El equipo aprueba el carné en la pestaña Estudiantes
  const he = env.hoja('Estudiantes');
  const cEstado = env.colIndex('Estudiantes', 'Estado');
  he.getRange(2, cEstado).setValue('Aprobado');
  env.ctx.alEditarHoja(env.edicion(he, 2, cEstado));

  const codigo = String(he.getRange(2, env.colIndex('Estudiantes', 'Código')).getValue());
  assert.match(codigo, /^[0-9a-f]{16}$/);
  assert.equal(env.correos.length, 3);
  assert.match(env.correos[2].subject, /aprobado/);

  // Con el código ya puede registrarse con la tarifa de estudiante
  const rp = env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'estudiante', codigo: codigo }));
  assert.equal(rp.ok, true);
  const h = env.hoja('Inscritos');
  assert.equal(h.getRange(2, env.colIndex('Inscritos', 'Tarifa')).getValue(), 'Estudiante');
});

test('rechaza carné de tipo o tamaño inválido', () => {
  const env = crearEntorno();
  const res = env.json(env.ctx.solicitudEstudiante({
    accion: 'solicitudEstudiante', datos: DATOS, institucion: 'UNITEC',
    carne: { nombre: 'x.exe', tipo: 'application/x-msdownload', base64: 'AAAA' },
  }));
  assert.equal(res.ok, false);
  assert.equal(env.archivos.length, 0);
  assert.equal(env.hoja('Estudiantes').getLastRow(), 1);
});

// ---------- Ventanas de tarifa en doGet ----------

test('doGet marca disponible solo la tarifa vigente por fecha', () => {
  const env = crearEntorno();
  env.setHoy('2026-11-10'); // dentro de Regular
  const res = env.json(env.ctx.doGet({ parameter: {} }));
  const porId = {};
  res.tarifas.forEach(function (t) { porId[t.id] = t.disponible; });
  assert.equal(porId.preventa, false);
  assert.equal(porId.regular, true);
  assert.equal(porId.finales, false);
});

/**
 * STORYCRAFTERS — crea los dos Formularios de Google de inscripción (Individual y Grupal).
 *
 * Cómo usarlo (detalle en docs/GOOGLE-FORMS.md):
 *   1. Entra a https://script.google.com con la cuenta de Google que será dueña de los formularios.
 *   2. Nuevo proyecto → borra el contenido → pega este archivo → Guardar.
 *   3. Revisa el bloque CONFIG de abajo (sobre todo los textos marcados [PENDIENTE]).
 *   4. Selecciona la función `crearFormularios` → Ejecutar → acepta los permisos.
 *   5. Mira el registro de ejecución: ahí salen las URLs de edición y de respuesta de cada formulario.
 *
 * Es seguro ejecutarlo más de una vez, pero cada ejecución crea formularios NUEVOS (no edita los anteriores);
 * borra los sobrantes desde Google Drive.
 */

var CONFIG = {
  EVENTO: 'STORYCRAFTERS · Masterclass de storytelling documental',
  FECHA_LUGAR: 'Sábado 12 de diciembre de 2026 · Estudios Alfa y Omega Visión, San Pedro Sula',
  URL_PAGO: 'https://sc.themediabuilders.com/#pagar',
  // Plazo con el que se promete confirmar el pago. Confirmar con el dueño (Q10/Q11 de docs/PLAN-INSCRIPCION.md).
  PLAZO_CONFIRMACION: '48 horas',
  // Enlace a la guía de tallas; déjalo vacío si no existe.
  URL_GUIA_TALLAS: '',
  // Texto de la política de reembolso. NO inventar: debe redactarlo el dueño (Q17).
  POLITICA_TEXTO: '[PENDIENTE] Acepto la política de reembolso y transferencia de cupo',
  CONSENTIMIENTO_IMAGEN: 'Autorizo el uso de mi imagen en fotos y video del evento',
  CONSENTIMIENTO_DATOS: 'Autorizo el tratamiento de mis datos personales para fines del evento',
  MAX_GRUPO: 10,
  TALLAS: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  COMO_SE_ENTERO: ['Instagram', 'Facebook', 'WhatsApp', 'Un amigo o colega', 'Mi universidad o empresa', 'Otro']
};

var TIPOS = ['Estudiante', 'Profesional o independiente', 'Empresa u organización'];

/** Punto de entrada: crea ambos formularios y escribe sus URLs en el registro. */
function crearFormularios() {
  var individual = crearIndividual_();
  var grupal = crearGrupal_();
  Logger.log('INDIVIDUAL  editar : ' + individual.getEditUrl());
  Logger.log('INDIVIDUAL  publicar: ' + individual.getPublishedUrl());
  Logger.log('GRUPAL      editar : ' + grupal.getEditUrl());
  Logger.log('GRUPAL      publicar: ' + grupal.getPublishedUrl());
  Logger.log('Siguiente paso: en cada formulario → Respuestas → Vincular a Hojas de cálculo (docs/GOOGLE-FORMS.md §4).');
  if (CONFIG.POLITICA_TEXTO.indexOf('[PENDIENTE]') >= 0) {
    Logger.log('⚠ POLITICA_TEXTO sigue como [PENDIENTE]: edita la casilla de política en ambos formularios antes de publicar.');
  }
}

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

function nuevoFormulario_(titulo, descripcion, mensajeConfirmacion) {
  var f = FormApp.create(titulo);
  f.setDescription(descripcion);
  f.setCollectEmail(true);            // correo obligatorio: sirve para cruzar con el pago de PayPal
  f.setAllowResponseEdits(false);
  f.setLimitOneResponsePerUser(false); // evita forzar inicio de sesión
  f.setShowLinkToRespondAgain(false);
  f.setProgressBar(true);
  f.setConfirmationMessage(mensajeConfirmacion);
  return f;
}

function texto_(f, titulo, ayuda, obligatorio) {
  var it = f.addTextItem().setTitle(titulo).setRequired(obligatorio !== false);
  if (ayuda) it.setHelpText(ayuda);
  return it;
}

function correo_(f, titulo, ayuda) {
  var it = texto_(f, titulo, ayuda, true);
  it.setValidation(FormApp.createTextValidation().setHelpText('Escribe un correo válido.').requireTextIsEmail().build());
  return it;
}

function telefono_(f, titulo) {
  var it = texto_(f, titulo, 'Con código de país, por ejemplo +504 9999-9999. Solo para avisos del evento.', true);
  it.setValidation(FormApp.createTextValidation().setHelpText('Escribe un número de teléfono válido.')
    .requireTextMatchesPattern('^[+0-9][0-9 ()-]{6,19}$').build());
  return it;
}

function talla_(f) {
  var ayuda = 'Camiseta oficial del evento incluida.' + (CONFIG.URL_GUIA_TALLAS ? ' Guía de tallas: ' + CONFIG.URL_GUIA_TALLAS : '');
  return f.addMultipleChoiceItem().setTitle('Talla de camiseta').setHelpText(ayuda)
    .setChoiceValues(CONFIG.TALLAS).setRequired(true);
}

function alimentacion_(f) {
  return f.addParagraphTextItem().setTitle('Restricciones alimentarias o de accesibilidad')
    .setHelpText('Opcional. El almuerzo y el coffee break están incluidos.').setRequired(false);
}

function casilla_(f, titulo, etiqueta) {
  // Casilla única obligatoria: el formulario no avanza si no se marca.
  var it = f.addCheckboxItem().setTitle(titulo).setRequired(true);
  it.setChoices([it.createChoice(etiqueta)]);
  return it;
}

function facturacion_(f) {
  f.addMultipleChoiceItem().setTitle('¿Necesitas factura?')
    .setChoiceValues(['No', 'Sí']).setRequired(true);
  texto_(f, 'Nombre o razón social para la factura', 'Solo si respondiste "Sí".', false);
  texto_(f, 'RTN para la factura', 'Solo si respondiste "Sí". 14 dígitos.', false);
}

function mensaje_(texto) {
  return texto + '\n\nTu lugar AÚN NO está confirmado: falta el pago.\n' +
    'Paga aquí: ' + CONFIG.URL_PAGO + '\n' +
    'Usa el MISMO correo con el que llenaste este formulario. ' +
    'Te confirmaremos en un máximo de ' + CONFIG.PLAZO_CONFIRMACION + '.';
}

// ---------------------------------------------------------------------------------------------
// Formulario INDIVIDUAL
// ---------------------------------------------------------------------------------------------

function crearIndividual_() {
  var f = nuevoFormulario_(
    'Inscripción individual · STORYCRAFTERS',
    CONFIG.EVENTO + '\n' + CONFIG.FECHA_LUGAR + '\nCompleta tus datos; al final te llevamos al pago.',
    mensaje_('¡Gracias por inscribirte!')
  );

  // Sección 1 — datos personales. La pregunta que ramifica ("Soy…") va al FINAL de la sección:
  // Forms aplica la ramificación al terminar la sección.
  f.addSectionHeaderItem().setTitle('Tus datos');
  texto_(f, 'Nombre y apellidos completos', 'Tal como quieres que aparezca en tu diploma de participación.');
  telefono_(f, 'WhatsApp o teléfono');
  texto_(f, 'Ciudad y país');
  texto_(f, 'Universidad o empresa que representas', 'Si eres independiente escribe "Independiente".');
  talla_(f);
  alimentacion_(f);
  f.addListItem().setTitle('¿Cómo te enteraste del evento?').setChoiceValues(CONFIG.COMO_SE_ENTERO).setRequired(false);
  var soy = f.addListItem().setTitle('Soy…').setChoiceValues(TIPOS).setRequired(true);

  // Sección 2 — solo estudiantes.
  var pbCarne = f.addPageBreakItem().setTitle('Datos de estudiante')
    .setHelpText('Deberás presentar tu carné vigente el día del evento; sin carné se cobra la diferencia con la tarifa vigente.');
  texto_(f, 'Número de carné estudiantil');

  // Sección 3 — facturación y consentimientos (todos llegan aquí).
  var pbFact = f.addPageBreakItem().setTitle('Facturación y autorizaciones');
  facturacion_(f);
  casilla_(f, 'Política de reembolso y transferencia de cupo', CONFIG.POLITICA_TEXTO);
  casilla_(f, 'Uso de imagen', CONFIG.CONSENTIMIENTO_IMAGEN);
  casilla_(f, 'Datos personales', CONFIG.CONSENTIMIENTO_DATOS);

  // Cableado: estudiantes pasan por la sección de carné; los demás la saltan.
  soy.setChoices([
    soy.createChoice(TIPOS[0], pbCarne),
    soy.createChoice(TIPOS[1], pbFact),
    soy.createChoice(TIPOS[2], pbFact)
  ]);
  return f;
}

// ---------------------------------------------------------------------------------------------
// Formulario GRUPAL (bucle de participantes)
// ---------------------------------------------------------------------------------------------

function crearGrupal_() {
  var f = nuevoFormulario_(
    'Inscripción grupal (2 o más) · STORYCRAFTERS',
    CONFIG.EVENTO + '\n' + CONFIG.FECHA_LUGAR + '\nMínimo 2 y máximo ' + CONFIG.MAX_GRUPO +
      ' participantes. Quien llena este formulario es el responsable del grupo y quien realiza el pago.',
    mensaje_('¡Gracias por inscribir a tu grupo!') +
      '\nEn la página de pago elige "Pagar en grupo" y selecciona EXACTAMENTE la misma cantidad de participantes que registraste.'
  );

  // Sección 1 — responsable.
  f.addSectionHeaderItem().setTitle('Responsable del grupo');
  texto_(f, 'Nombre completo del responsable');
  telefono_(f, 'WhatsApp o teléfono del responsable');
  texto_(f, 'Universidad o empresa del grupo', 'Si es un grupo de independientes escribe "Independientes".');
  facturacion_(f);

  // Secciones 2..(MAX+1) — participantes.
  var pbs = [];        // PageBreakItem de cada participante
  var otros = [];      // pregunta "¿Agregar otro participante?" de cada participante (null en el 1 y en el último)
  for (var n = 1; n <= CONFIG.MAX_GRUPO; n++) {
    var pb = f.addPageBreakItem().setTitle('Participante ' + n);
    if (n === 1) pb.setHelpText('Datos de la primera persona del grupo.');
    pbs.push(pb);
    texto_(f, 'Nombre y apellidos completos (participante ' + n + ')', 'Tal como aparecerá en el diploma de participación.');
    correo_(f, 'Correo del participante ' + n, 'Para enviarle información del evento y su diploma.');
    f.addListItem().setTitle('Participante ' + n + ' es…').setChoiceValues(TIPOS).setRequired(true);
    texto_(f, 'Universidad o empresa del participante ' + n, 'Solo si es distinta a la del grupo.', false);
    texto_(f, 'Número de carné (participante ' + n + ')', 'Obligatorio si es estudiante; deberá presentarlo el día del evento.', false);
    talla_(f).setTitle('Talla de camiseta (participante ' + n + ')');
    alimentacion_(f).setTitle('Restricciones alimentarias o de accesibilidad (participante ' + n + ')');
    // El participante 1 pasa directo al 2 (mínimo 2) y el último pasa directo al cierre.
    otros.push(n >= 2 && n < CONFIG.MAX_GRUPO
      ? f.addMultipleChoiceItem().setTitle('¿Agregar otro participante?').setRequired(true)
      : null);
  }

  // Sección final — cierre.
  var pbCierre = f.addPageBreakItem().setTitle('Cierre y autorizaciones');
  var cuantos = [];
  for (var c = 2; c <= CONFIG.MAX_GRUPO; c++) cuantos.push(String(c));
  f.addListItem().setTitle('Confirma cuántos participantes registraste')
    .setHelpText('Debe coincidir con la cantidad que elijas al pagar.').setChoiceValues(cuantos).setRequired(true);
  casilla_(f, 'Política de reembolso y transferencia de cupo', CONFIG.POLITICA_TEXTO);
  casilla_(f, 'Uso de imagen', 'Todos los participantes autorizan el uso de su imagen en fotos y video del evento');
  casilla_(f, 'Datos personales', 'Autorizo el tratamiento de los datos personales de los participantes para fines del evento');

  // Cableado del bucle (los destinos ya existen).
  for (var i = 0; i < otros.length; i++) {
    var q = otros[i];
    if (!q) continue;
    q.setChoices([
      q.createChoice('Sí', pbs[i + 1]),   // otro participante → siguiente sección de participante
      q.createChoice('No', pbCierre)      // terminar → cierre
    ]);
  }
  return f;
}

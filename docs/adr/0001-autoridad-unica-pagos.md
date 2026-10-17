# ADR-0001 · Autoridad única de mutación de pagos en Apps Script

**Estado:** aceptada, enmendada el 2026-10-17 (PayPal automático por IPN, ver abajo) · **Fecha:** 2026-10-16 · **Issue:** #20 · **Plan:** `docs/plans/2026-10-16-storycrafters-checkout-transferencia.md` (§5, hallazgos R3/F1/F7)

## Contexto

El backend es un Google Apps Script desplegado como web app pública (`doGet`/`doPost`, "ejecutar como Yo"). Las preinscripciones y las subidas de comprobante llegan anónimas por ese endpoint. La verificación de pagos es **exclusivamente humana** (decisión del propietario): un operador contrasta el abono en PayPal o en el banco.

El plan exige (R3): una **autoridad serializada única** para las transiciones `Pendiente → Completado`, separando la superficie pública de la acción de aprobación, sin que dos proyectos Apps Script muten concurrentemente (un `ScriptLock` no se comparte entre proyectos).

## Decisión

**Un solo proyecto Apps Script, vinculado (container-bound) a la hoja "Inscritos"**, que expone las dos caras:

1. **Cara pública (web app `/exec`):** solo operaciones sin privilegio de estado:
   `doGet` (cupos/tarifas/enlace de estudiante), `doPost` con `accion ∈ {preinscripcion, iniciarPago, subirComprobante, listaEspera, solicitudEstudiante}`. Ninguna acción pública puede escribir `Completado`, `Referencia de pago` real ni `Verificado por`.
2. **Cara administrativa (UI de Sheets):** `onOpen()` dibuja el menú **STORYCRAFTERS ▸ Confirmar pago verificado**. El operador selecciona la fila y confirma en un diálogo, declarando que verificó el abono fuera del sistema. `confirmarPago` exige `Session.getActiveUser().getEmail()` presente y en la allowlist `OPERADORES` (Script Property); si la identidad no está disponible, **rechaza** sin imputar la del instalador.

Al ser un solo proyecto, `LockService.getScriptLock()` serializa toda mutación de estado: preinscripción, subida, confirmación y workers del outbox comparten el mismo lock lógico.

## Reglas derivadas (contrato)

- **`Estatus de Pago` ∈ {Pendiente, Completado}** es la fuente de verdad del cupo. `Pendiente` **nunca** reserva lugar; el cupo se vuelve a verificar bajo lock al confirmar.
- **Ledger `Acreditaciones`:** `Settlement key` = `Método:REFERENCIA` único global. La misma referencia no puede acreditar dos inscripciones ni repetirse en la misma.
- **Outbox `Notificaciones`:** único emisor de bienvenida/avisos. `eventKey` = `registrationId:plantilla:canal`; estados `queued/sent/failed/delivery_unknown/manual`. El trigger viejo `alEditarHoja` ya **no** envía bienvenida: una referencia escrita a mano se marca "Edición manual sin verificación" y se audita.
- **WhatsApp:** sin BSP configurado, los eventos quedan `manual` (tarea visible para el equipo), nunca `sent` falso.
- **Token de comprobante:** la subida exige un token aleatorio por registro; en la hoja solo se guarda su hash SHA-256, se consume al usarse y tope de 3 subidas por registro.
- **Datos bancarios:** viven solo en Script Properties (`TRANSFERENCIAS_HABILITADAS`, `BANCO_*`). La cuenta temporal BAC de pruebas se configura únicamente en el proyecto de sandbox; nunca en repo, ni en el despliegue de producción (gate G2 del plan).
- **Auditoría:** cada decisión (confirmar, rechazar por permiso, edición manual, doble settlement, sin cupo) escribe fila en `Auditoría` con actor y hora.

## Consecuencias

- **Migración:** el proyecto standalone actual se reemplaza por uno vinculado a la hoja (o la hoja adopta el proyecto): abrir la hoja → Extensiones → Apps Script → pegar el código → `instalar()` → redeploy `/exec`. El `HOJA_ID` se conserva como propiedad por compatibilidad. Pasos en `backend/LEEME.md`.
- **Limitación aceptada (R5, decisión del dueño):** los enlaces Hosted Button son públicos y reutilizables fuera de la landing; un pago huérfano (sin preinscripción) es posible y se gestiona por conciliación manual + playbook de reembolso. La invariante "ningún cobro sin registro" aplica al camino de la UI, no de forma absoluta.
- **Sin cupo → lista de espera:** cuando `cuposDisponibles = 0`, la landing cambia el formulario a captura nombre/correo/WhatsApp (`accion: listaEspera`, pestaña "Lista de espera").
- Rate limit público real: GAS web app no expone IP del cliente; el freno implementado es por correo/día (3) y por registro (3 comprobantes). Protección IP queda fuera de alcance documentado.

## Enmienda 2026-10-17 · PayPal se acredita solo (IPN)

Decisión del propietario: los pagos con PayPal (saldo o tarjeta) no deben esperar a un operador. El `doPost` reconoce el aviso IPN (formulario, no JSON) y `ipnPayPal` lo acredita solo si: PayPal responde `VERIFIED` al postback, el receptor coincide con `PAYPAL_RECEPTOR`, `payment_status = Completed`, y hay una única preinscripción `Pendiente` del mismo monto en USD vinculable por correo del pagador o por nombre. La acreditación usa el mismo núcleo que el menú (`acreditarPago_`: lock, settlement único `PayPal:txn_id`, cupo bajo lock, código de estudiante, outbox) con actor `PayPal (automático)`. Lo no vinculable queda como `Sin inscripción — revisar` en `Acreditaciones` (el operador lo reclama desde el menú con la misma referencia) y se avisa al equipo. Transferencias siguen siendo solo humanas.

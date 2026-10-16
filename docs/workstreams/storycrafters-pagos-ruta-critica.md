# WorkStream · Pagos STORYCRAFTERS (issue #20) — ruta crítica y coordinación

Guía versionada exigida por el plan (`docs/plans/2026-10-16-storycrafters-checkout-transferencia.md` §3)
antes de emitir unidades de implementación en paralelo. Spec: `docs/specs/2026-10-16-storycrafters-paypal-modal-spec.md`.

## Decisiones del propietario ya tomadas (16-oct-2026)

| Gate | Decisión |
|---|---|
| R5 · Hosted Buttons huérfanos | **Aceptar excepción + conciliación.** Se mantienen los botones; pagos sin registro van al playbook de huérfanos/reembolso. No se promete la invariante absoluta. |
| F6/A1 · Cupo y lista de espera | `Pendiente` no reserva cupo. Al llenarse, el formulario cambia a captura **nombre/correo/WhatsApp** para el próximo evento (pestaña "Lista de espera", `accion: listaEspera`). |
| A2 · WhatsApp saliente | **Fallback manual.** Email automático con adjunto al equipo; WhatsApp queda `manual` en la cola `Notificaciones`. Sin falso positivo de entrega. |
| A1/G2 · Datos bancarios | Cuenta BAC temporal solo en Script Properties del despliegue de **sandbox** (`TRANSFERENCIAS_HABILITADAS=si`, `BANCO_*`). Nunca en repo ni en producción. Cuenta real de Media Builders = gate G5 antes de activar transferencias en prod. |

## Estado de las unidades del plan

| Unidad | Contenido | Estado | Rama / PR |
|---|---|---|---|
| A — Contratos y gates | ADR de autoridad única, esta guía, props y fixtures | ✅ Esta PR | `feat/20-checkout-transferencia--issue-20` |
| B — Persistencia y estados | Registration ID, idempotencia, `Estatus de Pago`, intentos, ledger, outbox, migración, confirmación humana (menú Sheets), fail-open cerrado, legacy retirado | ✅ Esta PR (backend) | misma |
| C — Modal de elección | Selector Tarjeta/Transferencia en el `<dialog>` existente, subida de comprobante en UI, lista de espera cuando `cuposDisponibles<=0` | ⏳ **Siguiente** | por asignar |
| D — Comprobantes | Endpoint `subirComprobante` implementado en esta PR; falta UI de C | backend ✅ / UI ⏳ | — |
| E — Avisos a operaciones | Email al equipo con adjunto + WhatsApp manual implementados | backend ✅ | — |
| F — Verificación humana | Menú `Confirmar pago verificado`, ledger, cupo bajo lock, auditoría | backend ✅ | — |
| G — Bienvenida | Outbox con eventKey único; email automático; WhatsApp manual | backend ✅ | — |
| H — Validación y despliegue | E2E real, sandbox PayPal, migración de la hoja de producción, guía del dueño, rollback | ⏳ Pendiente | — |

## Grafo de dependencias (del plan)

```
A → B → D → E → G → H
A → C ──┘      F ──┘
```

## Lo que queda por implementar (trabajo paralelizable)

| Slice | Archivos | Depende de | Notas |
|---|---|---|---|
| **C · Modal selector + comprobante + lista de espera (UI)** | `site/index.html`, `site/js/inscripcion.js`, `site/css/styles.css` | Contrato de esta PR (estable) | El backend ya responde `iniciarPago`/`subirComprobante`/`listaEspera`. Un solo agente — todos los archivos son del mismo frente. |
| **H · Despliegue y pruebas reales** | `backend/LEEME.md` (guía), sandbox | C + dueño (props, OPERADORES, cuenta real) | Redeploy `/exec`, migrar hoja de producción, bind a la hoja para el menú. Requiere manos del dueño. |
| **Playbook huérfanos (R5 ii)** | `docs/` | — | Documento operativo corto: cómo reconciliar un cobro sin preinscripción. |

**Regla de colisión:** `backend-inscripciones.gs` y `inscripcion.js` ya no deben tocarse en paralelo con esta PR; quien tome C parte de `main` **después** de fusionarla.

## Contrato backend → frontend (estable desde esta PR)

| Acción (`body.accion`) | Entrada | Salida |
|---|---|---|
| `preinscripcion` | `{tarifa, datos, codigo?, idempotencia}` | `{ok, registrationId, repetido?}` — reintento con misma clave devuelve el mismo registro |
| `iniciarPago` | `{registrationId, metodo:'paypal'}` | `{ok}` — intento `launched` antes de renderizar el Hosted Button |
| `iniciarPago` | `{registrationId, metodo:'transferencia'}` | `{ok, token, banco:{banco,titular,tipo,cuenta,moneda}, monto, moneda, referencia}` o `{ok:false, transferenciaDisponible:false}`; con comprobante ya recibido → `{ok, comprobante:'recibido'}` |
| `subirComprobante` | `{registrationId, token, archivo:{nombre,tipo,base64}}` | `{ok, estado}` — un solo uso por token; máx. 3 por registro |
| `listaEspera` | `{nombre, correo, whatsapp}` | `{ok, repetido?}` |
| `doGet` | — | `{ok, cuposDisponibles, tarifas}` — `cuposDisponibles<=0` ⇒ modo lista de espera |

## Invariantes que todo slice debe respetar

1. Ningún pago sale del estado `Pendiente` sin la acción humana del menú (`confirmarPago` con operador en `OPERADORES` + `confirmo:true`). OCR/foto/webhook nunca aprueban.
2. `Completado` ⇒ `Acreditaciones` tiene su `Settlement key` y `Auditoría` tiene el evento.
3. La bienvenida sale solo por `Notificaciones` (email automático; WhatsApp `manual`), una vez por `eventKey`.
4. Los datos bancarios solo salen del servidor si `TRANSFERENCIAS_HABILITADAS=si` y dentro de la respuesta de `iniciarPago` (nunca en HTML estático ni en `doGet` abierto).
5. Copy en español; nada de secretos/datos bancarios en el repo.

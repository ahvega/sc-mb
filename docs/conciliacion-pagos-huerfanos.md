# Playbook · Pagos huérfanos y conciliación manual

Decisión del propietario (16-oct-2026, hallazgo R5-ii del plan): los PayPal Hosted Buttons son
enlaces públicos y reutilizables — alguien puede pagar **sin** haberse preinscrito en la landing.
Se acepta la excepción; estos cobros se gestionan por conciliación manual. Ver `docs/adr/0001`.

## Qué es un pago huérfano

Un abono en PayPal (o en la cuenta bancaria) que **no tiene fila en `Inscritos`**. La landing ya
no deja pagar sin registrar primero, pero el enlace del botón puede compartirse, reutilizarse de
una visita anterior o abrirse desde el correo de PayPal de otro evento.

## Señales

- Recibo de PayPal con monto de una tarifa (US$ 64 / 72 / 82) sin preinscripción coincidente en
  nombre, correo y ventana de tiempo.
- Abono bancario en HNL (1700 / 1900 / 2200) sin comprobante subido ni fila `Pendiente`.
- Fila `Intentos de Pago` en `unknown` (PayPal lanzado, sin verificación): NO es huérfano — es
  un intento que sí tiene registro; revisar contra PayPal antes de clasificarlo.

## Procedimiento

1. **Buscar la fila.** Filtra `Inscritos` por correo/nombre del recibo. Tres casos:
   - **Existe fila `Pendiente`** → no es huérfano: verificar el abono (monto/moneda exactos) y
     confirmar desde el menú *STORYCRAFTERS ▸ Confirmar pago verificado*.
   - **Existe fila `Completado`** → ya acreditado; nada que hacer (posible doble pago → paso 3).
   - **No existe fila** → huérfano.
2. **Contactar al pagador** por el correo del recibo de PayPal: pedir nombre completo y si quiere
   asistir. Si quiere lugar y hay cupo, pedirle que llene la landing normalmente; su fila
   `Pendiente` se confirma con la referencia de la transacción ya existente.
3. **Devolución.** Si no quiere lugar, no hay cupo, o es un doble pago: reembolsar desde PayPal
   (botón *Issue a refund* en la transacción) o devolución bancaria. Registrar la gestión en la
   fila de `Auditoría` (o nota en el recibo) con fecha y quién la hizo.
4. **Nunca** crear una fila `Completado` a mano para un huérfano: sin `Registration ID` no hay
   trazabilidad. Si debe quedar constancia, anotarlo en `Auditoría`.

## Doble pago de una misma persona

La misma referencia no puede acreditarse dos veces (el ledger lo bloquea), pero una persona puede
haber pagado por **dos botones distintos** (tarifa vieja + tarifa nueva). Casos:

- Las dos filas son de la misma persona → confirmar la que corresponde a su tarifa y reembolsar
  la otra transacción.
- Una fila pagó de más/menos que su tarifa → verificar contra el monto esperado antes de
  confirmar; el diálogo avisa si el monto no coincide.

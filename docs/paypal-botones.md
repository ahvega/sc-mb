# Botones de pago PayPal — Story Crafters

Cuenta: Media Builders, S. de R.L. de C.V. (PayPal Business)
Creados: 16 oct 2026, en PayPal → Enlaces y botones de pago.
Este archivo no tiene contraseñas. El `client-id` es público: PayPal lo pone en el código para que se vea en tu página.

| Precio | Para quién | Id. hospedado | Enlace de pago directo |
|---|---|---|---|
| 64 USD | Preventa y estudiantes | `EVQLQJYJFXG22` | https://www.paypal.com/ncp/payment/EVQLQJYJFXG22 |
| 72 USD | Regular | `HX6U8RXCBEBV2` | https://www.paypal.com/ncp/payment/HX6U8RXCBEBV2 |
| 82 USD | Cupos finales | `LRTKVH5K9NE84` | https://www.paypal.com/ncp/payment/LRTKVH5K9NE84 |

## Parte 1: va una sola vez por página, en el `<head>`

```html
<script
  src="https://www.paypal.com/sdk/js?client-id=BAAjkswxk5Fus5kV-9Y8r64e3fcTZwnvJ5fRdQgqwnCLjkBRUvVHy6d_wEIhztGducb7d808wvju7YmXb0&components=hosted-buttons&disable-funding=venmo&currency=USD">
</script>
```

## Parte 2: un bloque por botón, donde quieras que aparezca

### 64 USD — Preventa y estudiantes

```html
<div id="paypal-container-EVQLQJYJFXG22"></div>
<script>
  paypal.HostedButtons({
    hostedButtonId: "EVQLQJYJFXG22",
  }).render("#paypal-container-EVQLQJYJFXG22")
</script>
```

### 72 USD — Regular

```html
<div id="paypal-container-HX6U8RXCBEBV2"></div>
<script>
  paypal.HostedButtons({
    hostedButtonId: "HX6U8RXCBEBV2",
  }).render("#paypal-container-HX6U8RXCBEBV2")
</script>
```

### 82 USD — Cupos finales

```html
<div id="paypal-container-LRTKVH5K9NE84"></div>
<script>
  paypal.HostedButtons({
    hostedButtonId: "LRTKVH5K9NE84",
  }).render("#paypal-container-LRTKVH5K9NE84")
</script>
```

## Notas

- PayPal dejó activada por defecto la opción "Recopilar dirección de envío" en los tres botones. Para un evento no hace falta; se puede quitar en PayPal con "Editar".
- Si no quieres poner código, puedes usar el enlace de pago directo de la tabla en un botón normal de tu página, en WhatsApp o en un correo.

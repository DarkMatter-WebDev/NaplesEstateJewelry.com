import type { LegalSection } from '@/components/legal/LegalPolicyPage';
import type { LegalPageKey } from '@/lib/legal-metadata';
import { addressWithLandmark, DEFAULT_STORE_HOURS, hoursLine } from '@/lib/business-location';

export interface SpanishLegalPageCopy {
  title: string;
  updated: string;
  intro?: string[];
  sections: LegalSection[];
}

const UPDATED = '19 de junio de 2026';
// Privacy + Cookie Preferences: Google Ads measurement for visitors who arrive
// from an ad (2026-10-02, lib/ads-tracking.ts). Mirrors the English pages.
const UPDATED_ADS_MEASUREMENT = '2 de octubre de 2026';

/**
 * The shipping-policy sections as a FACTORY, because bullet one prints the
 * showroom hours and those are admin-editable (2026-08): a module-scope
 * constant would freeze whatever hours existed at import. The shipping page
 * fetches the live schedule and rebuilds its sections through this; the
 * `SPANISH_LEGAL_COPY.shipping` entry below keeps a default-hours copy so
 * `getSpanishLegalCopy()` and the other legal pages stay untouched.
 */
export function spanishShippingSections(hoursLineEs: string): LegalSection[] {
  return [
    { title: 'Opciones de Entrega', bullets: [`Recogida local gratuita en nuestro salón, ${addressWithLandmark(true)} — ${hoursLineEs}.`, 'Envío prioritario asegurado y envío exprés asegurado al día siguiente para artículos elegibles.', 'Cada pedido enviado está asegurado por el precio total de compra.', 'Los artículos se envían en embalaje discreto y sin marca para proteger su privacidad y seguridad.'] },
    { title: 'Garantía de Autenticidad', body: ['Garantizamos que cada pieza es auténtica y corresponde a su descripción. Si un artículo fue materialmente mal descrito, se aplica nuestra garantía de devolución de 5 días; consulte la política de Devoluciones y Reembolsos.'] },
    { title: 'Revisión de Dirección e Identidad', body: ['Para pedidos de alto valor, podemos confirmar su identidad y dirección de envío antes de despachar. Esto le protege a usted y a nosotros contra el fraude y la entrega incorrecta de artículos valiosos.'] },
    { title: 'Costos y Plazos de Envío', body: ['Las opciones y costos de envío aparecen durante el pago. Un pedido de alto valor puede requerir un acuerdo específico con un transportista asegurado; de ser así, le contactaremos antes del envío. Procuramos despachar pronto los pedidos confirmados y compartir el seguimiento cuando el artículo esté en camino.'] },
    { title: 'Riesgo de Pérdida', body: ['Como los pedidos enviados están totalmente asegurados, los paquetes perdidos o dañados están cubiertos. Inspeccione el embalaje al recibirlo y contáctenos inmediatamente al (239) 404-8505 si existe algún daño o problema de entrega para que podamos presentar la reclamación.'] },
    { title: 'Destinos Restringidos', body: ['Podemos rechazar o cancelar envíos a destinos donde la entrega, el seguro, las restricciones legales o las limitaciones del transportista impidan una entrega segura y práctica.'] },
  ];
}

export const SPANISH_LEGAL_COPY: Record<LegalPageKey, SpanishLegalPageCopy> = {
  privacy: {
    title: 'Política de Privacidad',
    updated: UPDATED_ADS_MEASUREMENT,
    intro: [
      'Naples Estate Jewelry, operada por Naples Antiques LLC, respeta su privacidad. Esta política explica cómo recopilamos y utilizamos información cuando visita nuestro sitio web, crea una cuenta, envía un artículo, realiza una consulta, se suscribe a novedades o hace un pedido en línea.',
      'Esta política corresponde a nuestro sitio web actual de pequeña empresa. No afirma el cumplimiento de ninguna certificación o marco de privacidad que no hayamos obtenido por separado.',
    ],
    sections: [
      {
        title: 'Información que Recopilamos',
        bullets: [
          'Información de contacto, incluidos su nombre, correo electrónico, número de teléfono y dirección postal o de envío cuando la proporciona.',
          'Información de la cuenta, incluidos el correo de acceso, los datos del perfil, los favoritos, el carrito guardado, las preferencias de marketing y los registros de aceptación de políticas.',
          'Información de artículos y publicaciones, incluidas fotos, descripciones, notas, datos de inventario y mensajes enviados para una evaluación o consulta.',
          'Historial de compras y pedidos, incluidos los artículos del carrito, los totales, el método de envío, las notas y el estado del pago. Actualmente no almacenamos números completos de tarjetas en este sitio.',
          'Información técnica, como dirección IP, tipo de navegador, dispositivo, páginas visitadas, marcas de tiempo, registros de seguridad y datos de alojamiento o análisis generados al utilizar el sitio.',
          'Para los visitantes que llegan desde uno de nuestros anuncios de Google, el identificador de clic que Google añade a la dirección, que se guarda junto con cualquier formulario que nos envíe.',
        ],
      },
      {
        title: 'Cómo Utilizamos la Información',
        bullets: [
          'Crear y administrar cuentas, perfiles, carritos, favoritos y la seguridad de las cuentas.',
          'Responder llamadas, mensajes de texto, envíos de artículos, consultas de productos, solicitudes de contacto y mensajes de atención al cliente.',
          'Procesar pedidos, preparar facturas, coordinar la recogida o el envío y mantener registros de compra.',
          'Prevenir fraude, proteger el inventario, asegurar el sitio, resolver errores, hacer cumplir nuestros términos y cumplir obligaciones legales.',
          'Enviar mensajes de servicio, comunicaciones sobre pedidos y novedades de marketing cuando haya dado su consentimiento o la ley lo permita.',
          'Comprender el rendimiento del sitio y mejorar nuestro sitio web, tienda, servicios y experiencia del cliente.',
        ],
      },
      {
        title: 'Cookies, Almacenamiento Local y Medición Publicitaria',
        body: [
          'El sitio utiliza cookies esenciales y almacenamiento del navegador para autenticación, selección de idioma, funcionamiento del carrito y favoritos, preferencias del aviso de cookies y seguridad básica. También utilizamos los registros normales del proveedor de alojamiento.',
          'Nos anunciamos en Google. Si llega a este sitio al hacer clic en uno de nuestros anuncios de Google, la etiqueta de Google se carga durante su visita y guarda cookies de Google Ads en su navegador, para que Google pueda medir si el anuncio generó un toque en nuestro número de teléfono, una solicitud de indicaciones o el envío de un formulario. Todos los enlaces de llamada siguen marcando nuestro número habitual, y el identificador de clic del anuncio se guarda junto con cualquier formulario que nos envíe. Mantenemos desactivada la personalización de anuncios para esta etiqueta: mide resultados y no se utiliza para crear audiencias publicitarias. Los visitantes que no llegan desde un anuncio no cargan la etiqueta de Google.',
          'Puede desactivar esta medición en cualquier momento en la página de Preferencias de Cookies, y respetamos la señal Global Privacy Control. No utilizamos Google Analytics, Meta Pixel, Microsoft Clarity, Hotjar ni herramientas similares de seguimiento del comportamiento.',
        ],
      },
      {
        title: 'Proveedores de Servicios',
        bullets: [
          'Supabase para autenticación, registros de base de datos, perfiles, favoritos, carritos, consultas, productos y datos administrativos.',
          'Netlify para alojamiento, despliegue, infraestructura de ejecución, formularios y registros relacionados.',
          'Resend para correo transaccional y administrativo, incluidos avisos de consultas y pedidos.',
          'Google Maps para el mapa del salón incrustado en nuestras páginas de inicio y de contacto. El mapa se carga desde Google cuando se desplaza hasta él, y Google puede recibir su dirección IP y guardar sus propias cookies conforme a sus propios términos. Nada de lo que escribe en nuestro sitio se le envía, y la dirección, los horarios y el enlace de indicaciones también se muestran como texto sin él.',
          'Google Ads para medir los resultados de nuestra publicidad, como se describe arriba, solo para los visitantes que llegan desde uno de nuestros anuncios. Google trata esos datos conforme a sus propios términos.',
          'TradingView para las gráficas en vivo de los precios del oro, la plata y el platino en nuestras páginas de oro, plata, lingotes y precios en vivo. Las gráficas se cargan desde TradingView, que puede recibir su dirección IP y guardar sus propias cookies conforme a sus propios términos. Nada de lo que escribe en nuestro sitio se le envía.',
          'Procesadores de pago cuando se habilitan pagos en línea; la información de pago es gestionada por el procesador conforme a sus propios términos.',
          'Proveedores de envío cuando se coordina un envío o una entrega asegurada.',
          'Asesores profesionales, servicios de prevención de fraude o autoridades cuando sea razonablemente necesario por motivos legales, de seguridad, contabilidad, impuestos o cumplimiento.',
        ],
      },
      {
        title: 'Cuándo Compartimos Información',
        body: [
          'No vendemos información personal. Solo compartimos información cuando es necesario para operar el sitio y el negocio, prestar los servicios solicitados, procesar pedidos, comunicarnos con usted, proteger el sitio, cumplir la ley o completar una transferencia empresarial, como una fusión o venta de activos.',
        ],
      },
      {
        title: 'Sus Opciones y Derechos',
        bullets: [
          'Puede solicitar una copia de la información de cuenta o contacto que mantenemos sobre usted.',
          'Puede solicitar correcciones de información inexacta de cuenta, pedido o contacto.',
          'Puede solicitar la eliminación de información personal, sujeta a obligaciones legales, fiscales, de prevención de fraude, inventario, transacciones y conservación de registros.',
          'Puede cancelar los correos de marketing en cualquier momento mediante el enlace de cancelación disponible o comunicándose directamente con nosotros.',
          'Si aceptó recibir alertas por texto, puede detenerlas en cualquier momento respondiendo STOP a cualquier mensaje o comunicándose directamente con nosotros. No compartimos números de celular ni el consentimiento para mensajes de texto con terceros o afiliados para sus fines de marketing.',
          'Puede utilizar Preferencias de Cookies para restablecer el aviso del sitio y para desactivar o activar la medición de Google Ads. Las cookies y el almacenamiento esenciales son necesarios para las funciones principales.',
        ],
      },
      {
        title: 'Conservación y Seguridad',
        body: [
          'Conservamos la información solo durante el tiempo razonablemente necesario para los fines descritos, incluidos atención al cliente, registros de transacciones, obligaciones legales, seguridad, prevención de fraude y administración empresarial.',
          'Aplicamos medidas de seguridad comercialmente razonables, como autenticación alojada, HTTPS en producción, controles de acceso a la base de datos y acceso administrativo limitado. Ningún sitio web o método de transmisión es completamente seguro.',
        ],
      },
      {
        title: 'Privacidad de Menores',
        body: [
          'Nuestro sitio no está dirigido a menores de 13 años. No recopilamos deliberadamente información personal de menores de 13 años. Si descubrimos que hemos recopilado dicha información, tomaremos medidas razonables para eliminarla.',
        ],
      },
      {
        title: 'Cambios a Esta Política',
        body: [
          'Podemos actualizar esta política cuando cambien el sitio, la tienda, los requisitos legales o los proveedores de servicios. La versión actualizada se publicará en esta página con una nueva fecha de vigencia.',
        ],
      },
      {
        title: 'Contacto',
        body: [
          'Las preguntas o solicitudes de privacidad pueden dirigirse a Naples Estate Jewelry, operada por Naples Antiques LLC, llamando o enviando un mensaje de texto al (239) 404-8505 o utilizando la página de Contacto.',
        ],
      },
    ],
  },
  terms: {
    title: 'Términos de Servicio',
    updated: UPDATED,
    intro: [
      'Estos Términos de Servicio se aplican a naplesestatejewelry.com y a los servicios relacionados proporcionados por Naples Estate Jewelry, operada por Naples Antiques LLC. Al utilizar el sitio, crear una cuenta, enviar información o hacer un pedido, acepta estos términos.',
    ],
    sections: [
      {
        title: 'Nuestro Sitio Web y Servicios',
        body: ['Operamos un sitio web de pequeña empresa para servicios de compra de joyería de patrimonio y antigüedades, consultas de productos, cuentas de clientes, carritos guardados, solicitudes de pedidos en línea y publicaciones seleccionadas de comercio electrónico.'],
      },
      {
        title: 'Elegibilidad y Registro de Cuenta',
        body: [
          'Debe tener al menos 13 años para crear una cuenta o utilizar este sitio. Al utilizarlo o crear una cuenta, declara y garantiza que tiene al menos 13 años.',
          'Al crear una cuenta, acepta proporcionar información exacta, mantener seguras sus credenciales y notificarnos si cree que su cuenta ha sido comprometida.',
        ],
      },
      {
        title: 'Responsabilidades del Usuario',
        bullets: [
          'Proporcionar información exacta de contacto, cuenta, pedido, artículo y pago.',
          'Utilizar el sitio solo con fines legales y no interferir con su seguridad u operación.',
          'No enviar contenido falso, engañoso, infractor, ilegal o perjudicial.',
        ],
      },
      {
        title: 'Cuentas y Terminación',
        body: ['Podemos rechazar, suspender o cancelar cuentas o pedidos cuando sea razonablemente necesario para proteger a clientes, inventario, negocio, seguridad del sitio, cumplimiento legal u otros usuarios. Puede solicitar la eliminación de su cuenta, sujeta a las necesidades de conservación de registros legales y de transacciones.'],
      },
      {
        title: 'Pedidos, Precios y Pagos',
        body: [
          'La disponibilidad, las descripciones, los precios de metales y los precios de productos pueden cambiar. La joyería de patrimonio y las antigüedades suelen ser piezas únicas y pueden venderse o dejar de estar disponibles. Enviar información de pago crea una solicitud de pedido; no garantiza la venta hasta confirmar el pago, la identidad, la disponibilidad y la entrega.',
          'El procesamiento de pagos en línea es proporcionado por un procesador de pagos de terceros. Acepta proporcionar información de pago exacta y autoriza los cargos aplicables a compras confirmadas.',
        ],
      },
      {
        title: 'Condición de Artículos y Bienes de Patrimonio',
        body: ['Los artículos de patrimonio, antiguos y usados pueden mostrar edad, desgaste, reparaciones, ajustes de tamaño, pátina o características de propiedad anterior. Procuramos describirlos con precisión, pero debe revisar cuidadosamente las fotos, medidas, pesos, contenido metálico, piedras y notas de condición antes de comprar.'],
      },
      {
        title: 'Uso Aceptable',
        bullets: [
          'No intentar accesos no autorizados, extracción automatizada, sondeos, ingeniería inversa o interrupción del sitio.',
          'No cargar malware, correo no deseado, contenido engañoso o contenido que vulnere derechos de otra persona.',
          'No utilizar el sitio para vender o consultar sobre bienes robados, falsificados, obtenidos ilegalmente o prohibidos.',
        ],
      },
      {
        title: 'Propiedad Intelectual',
        body: ['El texto, las imágenes, la marca, el diseño, el software y demás contenido del sitio nos pertenecen o pertenecen a nuestros licenciantes, salvo indicación contraria. No puede copiarlos ni reutilizarlos comercialmente sin permiso. Al enviar fotos, descripciones o mensajes, nos autoriza a utilizarlos para evaluar, responder, respaldar, administrar o completar el servicio solicitado.'],
      },
      {
        title: 'Privacidad de Menores',
        body: ['Nuestro sitio no está dirigido a menores de 13 años. No recopilamos deliberadamente información personal de menores de 13 años. Si descubrimos que se ha recopilado dicha información, la eliminaremos.'],
      },
      {
        title: 'Descargos y Limitación de Responsabilidad',
        body: ['El sitio se proporciona según disponibilidad. En la máxima medida permitida por la ley, rechazamos garantías implícitas y no somos responsables de daños indirectos, incidentales, especiales, consecuentes o punitivos. Nuestra responsabilidad total por una reclamación relacionada con el sitio o una transacción se limita al importe que nos pagó por el artículo o servicio específico que originó la reclamación, salvo que la ley de Florida exija lo contrario.'],
      },
      {
        id: 'text-messages',
        title: 'Programa de Mensajes de Texto',
        body: [
          'Si elige alertas por texto al unirse a nuestra lista, Naples Estate Jewelry enviará mensajes de texto de marketing automatizados y recurrentes al número de celular que proporcione, como fotos y precios de piezas disponibles para la compra. El consentimiento no es condición de ninguna compra. La frecuencia de mensajes varía. Pueden aplicarse tarifas de mensajes y datos.',
          'Antes de enviar cualquier alerta recibirá un solo texto de confirmación; las alertas comienzan únicamente después de que responda YES. Responda STOP en cualquier momento para cancelar y recibirá un último mensaje confirmando la baja. Responda HELP para obtener ayuda, o llame o escriba al (239) 404-8505. Las operadoras no son responsables por mensajes retrasados o no entregados.',
          'No compartimos números de celular ni el consentimiento para mensajes de texto con terceros o afiliados para sus fines de marketing. Consulte la Política de Privacidad para saber cómo manejamos su información.',
        ],
      },
      {
        title: 'Resolución de Disputas y Ley de Florida',
        body: ['Estos términos se rigen por la ley de Florida, sin considerar sus normas sobre conflicto de leyes. Antes de presentar una reclamación formal, acepta comunicarse con nosotros e intentar resolver el asunto de manera informal. Los tribunales del condado de Collier, Florida, serán la jurisdicción preferida salvo que la ley aplicable exija otra.'],
      },
      {
        title: 'Contacto',
        body: ['Las preguntas sobre estos términos pueden dirigirse a Naples Estate Jewelry, operada por Naples Antiques LLC, llamando o enviando un mensaje de texto al (239) 404-8505 o utilizando la página de Contacto.'],
      },
    ],
  },
  'returns-refunds': {
    title: 'Devoluciones y Reembolsos',
    updated: UPDATED,
    intro: ['Nuestro inventario contiene piezas únicas de patrimonio con precios vinculados a los mercados en vivo del oro, la plata y el platino, que cambian constantemente. Revise cuidadosamente las fotos, descripciones, medidas, notas de condición y precios, y contáctenos antes de pagar si tiene alguna pregunta.'],
    sections: [
      { title: 'Todas las Ventas Son Finales', body: ['Debido a que nuestras piezas son usadas, de patrimonio y tienen precios vinculados a mercados de metales preciosos que cambian cada minuto, todas las ventas son finales una vez completado el pago. Un cambio posterior en el mercado del oro o la plata no constituye por sí solo motivo de devolución, reembolso o ajuste de precio.'] },
      { title: 'Si un Artículo Fue Descrito Incorrectamente (Garantía de 5 Días)', body: ['La única excepción es un artículo materialmente mal descrito, es decir, significativamente distinto de la descripción, metal, pureza, peso o condición publicados. Llame o escriba al (239) 404-8505 dentro de los cinco (5) días posteriores a recibirlo. Coordinaremos un reembolso completo cuando la pieza sea devuelta en la misma condición, con su embalaje, documentación y accesorios originales.'] },
      { title: 'Artículos Dañados o Incorrectos', body: ['Si un artículo llega dañado durante el transporte o recibió una pieza incorrecta, contáctenos inmediatamente al (239) 404-8505. Conserve todo el embalaje y tome fotos para que podamos revisar el problema y presentar una reclamación al seguro de envío.'] },
      { title: 'Cómo Se Emiten los Reembolsos', body: ['Los reembolsos aprobados por artículos mal descritos, dañados o incorrectos se emiten al método de pago original una vez recibido e inspeccionado el artículo devuelto. No envíe nada antes de llamarnos; coordinaremos previamente el envío de devolución de una reclamación aprobada.'] },
      { title: 'Contacto', body: ['Para cualquier pregunta sobre devoluciones o reembolsos, llame o escriba al (239) 404-8505 antes de devolver un artículo.'] },
    ],
  },
  shipping: {
    title: 'Política de Envío',
    updated: UPDATED,
    // Default-hours copy; the shipping page overrides `sections` with a live
    // rebuild via spanishShippingSections(). See the factory's docblock.
    sections: spanishShippingSections(hoursLine(DEFAULT_STORE_HOURS, true)),
  },
  accessibility: {
    title: 'Declaración de Accesibilidad',
    updated: UPDATED,
    intro: ['Naples Estate Jewelry desea que su sitio web pueda ser utilizado por clientes, vendedores y visitantes con discapacidades. La accesibilidad es un esfuerzo continuo, especialmente cuando cambian el inventario, las imágenes, las herramientas administrativas y las funciones de comercio electrónico.'],
    sections: [
      { title: 'Nuestro Compromiso', body: ['Procuramos que el sitio público sea razonablemente accesible mediante una estructura semántica, texto legible, formularios etiquetados, controles accesibles por teclado, enlaces descriptivos y texto alternativo cuando corresponde.'] },
      { title: 'Mejoras Continuas Conocidas', bullets: ['Continuar revisando el texto alternativo de imágenes de productos y decorativas a medida que se añade inventario.', 'Continuar comprobando el contraste de color al introducir nuevos estilos promocionales, de carrusel o administrativos.', 'Continuar probando la navegación por teclado en formularios, menús, carrito, pago, cuenta y ventanas modales.', 'Continuar proporcionando nombres accesibles claros a los controles que solo muestran iconos o símbolos.'] },
      { title: 'Comentarios', body: ['Si tiene dificultades para utilizar alguna parte del sitio, llame o escriba al (239) 404-8505. Indique la página, lo que intentaba hacer y, si se siente cómodo compartiéndolo, la tecnología de asistencia o el navegador que utilizaba.'] },
      { title: 'Servicios de Terceros', body: ['Algunas funciones pueden depender de terceros para autenticación, correo, alojamiento, formularios, pagos, mapas o envíos. No podemos controlar todas las interfaces de terceros, pero intentaremos ofrecer una alternativa razonable cuando sea posible.'] },
    ],
  },
  'cookie-preferences': {
    title: 'Preferencias de Cookies',
    updated: UPDATED_ADS_MEASUREMENT,
    intro: ['Este sitio utiliza cookies esenciales y almacenamiento del navegador para operar sus funciones principales. Para los visitantes que llegan desde uno de nuestros anuncios de Google, también carga la etiqueta de Google para medir si el anuncio generó un toque en nuestro número de teléfono, una solicitud de indicaciones o el envío de un formulario. No se utiliza ninguna otra herramienta de analítica o publicidad.'],
    sections: [
      { title: 'Cookies y Almacenamiento Esenciales', bullets: ['Cookies de autenticación de Supabase para el inicio de sesión y las sesiones de cuenta.', 'Cookies de selección de idioma, como NEXT_LOCALE.', 'Almacenamiento del carrito y los favoritos en el navegador para conservar estas funciones entre páginas.', 'Almacenamiento del aviso de cookies para que no vuelva a aparecer después de aceptarlo.', 'Su elección sobre la medición de anuncios (nej_ads_measurement_v1), para recordar el interruptor de abajo.'] },
      { title: 'Medición de Google Ads (opcional)', body: ['La etiqueta de Google se carga solo cuando su visita comienza desde uno de nuestros anuncios de Google (Google añade a la dirección un identificador de clic como gclid) y permanece desactivada para todos los demás. En esas visitas guarda cookies de Google Ads en su navegador (_gcl_aw, _gcl_au), y Google puede guardar sus propias cookies y almacenamiento en dominios de Google. También conservamos el identificador de clic en una cookie llamada nej_gclid y en el almacenamiento del navegador durante 90 días, para que un formulario que nos envíe pueda incluirlo.', 'La personalización de anuncios está desactivada para esta etiqueta: mide resultados y no se utiliza para crear audiencias publicitarias. Todos los enlaces de llamada marcan nuestro número habitual; nada en la página se reescribe.', 'Utilice el interruptor de abajo para desactivar o volver a activar esta medición. El botón "Solo esenciales" del aviso de cookies también la desactiva, y respetamos la señal Global Privacy Control.'] },
      { title: 'Administrar los Controles del Navegador', body: ['También puede borrar las cookies y el almacenamiento local desde la configuración del navegador. Esto puede cerrar su sesión, borrar el carrito o los favoritos locales, restablecer el idioma o hacer que vuelva a aparecer el aviso de cookies.'] },
    ],
  },
};

export function getSpanishLegalCopy(page: LegalPageKey, locale: string): SpanishLegalPageCopy | null {
  return locale === 'es' ? SPANISH_LEGAL_COPY[page] : null;
}

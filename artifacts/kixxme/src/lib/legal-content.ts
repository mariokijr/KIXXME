// Legal content for KixxMe public pages. Plain structured data so the UI layer
// can render it however it likes. Spanish copy. The entity-specific fields in
// "aviso-legal" (razón social, NIF, domicilio) must be completed by the operator
// before publishing to the stores.

export interface LegalBlock {
  heading?: string;
  body: string[];
  list?: string[];
}

export interface LegalDoc {
  slug: string;
  label: string;
  title: string;
  updated: string;
  intro?: string;
  blocks: LegalBlock[];
}

const UPDATED = "15 de junio de 2026";
const SUPPORT_EMAIL = "supportkixxme@gmail.com";
const DELETE_EMAIL = "mariokimbm2003@gmail.com";

export const LEGAL_LINKS: { slug: string; label: string; path?: string }[] = [
  { slug: "privacidad", label: "Política de privacidad", path: "/privacy" },
  { slug: "terminos", label: "Términos y condiciones", path: "/terms" },
  { slug: "cookies", label: "Política de cookies" },
  { slug: "normas-comunidad", label: "Normas de la comunidad" },
  { slug: "contacto", label: "Contacto" },
  { slug: "aviso-legal", label: "Información legal" },
];

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  privacidad: {
    slug: "privacidad",
    label: "Política de privacidad",
    title: "Política de privacidad",
    updated: UPDATED,
    intro:
      "En KixxMe nos tomamos muy en serio tu privacidad. Esta política explica qué datos recopilamos, con qué finalidad, con quién los compartimos y qué derechos tienes sobre ellos. KixxMe es una aplicación dirigida exclusivamente a personas mayores de 18 años.",
    blocks: [
      {
        heading: "1. Responsable del tratamiento",
        body: [
          'El responsable del tratamiento de tus datos es el titular del servicio KixxMe (en adelante, \u201cKixxMe\u201d, \u201cnosotros\u201d). Puedes contactar con nosotros para cualquier cuesti\u00f3n relacionada con la privacidad en ' +
            SUPPORT_EMAIL +
            ".",
        ],
      },
      {
        heading: "2. Datos que recopilamos",
        body: ["Recopilamos los siguientes datos para que la aplicación funcione:"],
        list: [
          "Datos de cuenta: dirección de correo electrónico, nombre de usuario y contraseña (almacenada de forma cifrada por nuestro proveedor de autenticación).",
          "Inicio de sesión con Google: cuando te registras o inicias sesión con Google, recopilamos tu nombre completo, dirección de correo electrónico, foto de perfil de Google y los datos básicos de autenticación que Google comparte con nosotros (identificador de cuenta, token de acceso). Estos datos se utilizan exclusivamente para crear y gestionar tu cuenta en KixxMe.",
          "Datos de perfil: edad, ciudad, biografía, fotografías, rol/preferencia y qué buscas.",
          "Ubicación: ubicación aproximada para mostrarte personas cercanas y calcular distancias, solo si concedes el permiso. Puedes usar la app sin ubicación con funciones reducidas.",
          'Contenido y actividad: mensajes de chat, im\u00e1genes enviadas, \u201cme gusta\u201d, \u201csuper me gusta\u201d, coincidencias (matches) y personas que visitan tu perfil.',
          "Verificación: si solicitas la insignia de verificación, una selfie de identidad que se guarda en un almacenamiento privado y solo es accesible por nuestro equipo de moderación mediante enlaces temporales.",
          "Datos de pago: si te suscribes a Plus o Gold, los pagos se procesan a través de Stripe. No almacenamos los datos completos de tu tarjeta.",
          "Datos técnicos: información básica del dispositivo y de uso necesaria para la seguridad y el correcto funcionamiento del servicio.",
        ],
      },
      {
        heading: "3. Finalidad y base legal",
        body: [
          "Tratamos tus datos para: crear y gestionar tu cuenta y perfil; ofrecerte el servicio de descubrimiento, chat y videollamadas; procesar suscripciones; verificar perfiles; moderar la comunidad y prevenir abusos; y enviarte comunicaciones relacionadas con el servicio.",
          "Las bases legales son la ejecución del contrato (los términos del servicio), tu consentimiento (por ejemplo, para la ubicación o la verificación) y nuestro interés legítimo en mantener una plataforma segura.",
        ],
      },
      {
        heading: "4. Con quién compartimos tus datos",
        body: [
          "No vendemos tus datos. Compartimos información, en la medida necesaria, con proveedores que nos ayudan a prestar el servicio:",
        ],
        list: [
          "Supabase: autenticación, base de datos y almacenamiento.",
          "Stripe: procesamiento de pagos y suscripciones.",
          "LiveKit: infraestructura de las videollamadas (las llamadas no se graban).",
          "Google: inicio de sesión social y autenticación, si decides usarlo.",
          "Proveedor de correo: envío de correos transaccionales (bienvenida, coincidencias, notificaciones).",
        ],
      },
      {
        heading: "5. Conservación",
        body: [
          "Conservamos tus datos mientras tu cuenta esté activa. Cuando eliminas tu cuenta, borramos o anonimizamos tu información personal, salvo aquello que debamos conservar por obligaciones legales o para prevenir fraudes y abusos.",
        ],
      },
      {
        heading: "6. Tus derechos y eliminación de datos",
        body: [
          "Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad. Desde la propia app puedes editar tu perfil y eliminar tu cuenta en los ajustes.",
          "Para solicitar la eliminación de tu cuenta y todos tus datos personales, también puedes escribirnos directamente a " +
            DELETE_EMAIL +
            " indicando el correo de tu cuenta. Procesaremos tu solicitud en un plazo máximo de 30 días.",
          "También tienes derecho a presentar una reclamación ante la autoridad de control competente.",
        ],
      },
      {
        heading: "7. Seguridad",
        body: [
          "Aplicamos medidas técnicas y organizativas para proteger tus datos, incluyendo cifrado en tránsito y control de acceso. Ningún sistema es totalmente infalible, pero trabajamos para mantener tu información segura.",
        ],
      },
      {
        heading: "8. Menores de edad",
        body: [
          "KixxMe está destinada exclusivamente a personas mayores de 18 años. No recopilamos de forma consciente datos de menores. Si detectamos una cuenta de un menor, la eliminaremos.",
        ],
      },
      {
        heading: "9. Cambios en esta política",
        body: [
          "Podemos actualizar esta política para reflejar cambios en el servicio o en la normativa. Publicaremos la versión vigente en esta página con su fecha de actualización.",
        ],
      },
    ],
  },

  terminos: {
    slug: "terminos",
    label: "Términos y condiciones",
    title: "Términos y condiciones",
    updated: UPDATED,
    intro:
      "Estos términos regulan el uso de KixxMe. Al crear una cuenta o utilizar la aplicación, aceptas estos términos en su totalidad. Si no estás de acuerdo, no utilices el servicio.",
    blocks: [
      {
        heading: "1. Elegibilidad",
        body: [
          "Debes tener al menos 18 años para usar KixxMe. Al registrarte declaras que eres mayor de edad y que la información que proporcionas es veraz.",
        ],
      },
      {
        heading: "2. Tu cuenta",
        body: [
          "Eres responsable de mantener la confidencialidad de tus credenciales y de toda la actividad realizada desde tu cuenta. Debes notificarnos cualquier uso no autorizado. Puedes registrarte con correo y contraseña o mediante inicio de sesión con Google.",
        ],
      },
      {
        heading: "3. Uso aceptable",
        body: [
          "Te comprometes a usar KixxMe de forma respetuosa y legal. Queda prohibido el acoso, la suplantación de identidad, el discurso de odio, el contenido ilegal, el spam, las estafas y cualquier conducta que ponga en riesgo a otras personas. El uso de la app está sujeto a nuestras Normas de la comunidad.",
        ],
      },
      {
        heading: "4. Contenido del usuario",
        body: [
          "Eres el único responsable del contenido que publicas (fotos, biografía, mensajes). Nos concedes una licencia limitada para alojar y mostrar ese contenido con el único fin de prestar el servicio. Podemos retirar contenido que infrinja estos términos o la ley.",
        ],
      },
      {
        heading: "5. Propiedad intelectual",
        body: [
          "La marca KixxMe, su logotipo, el diseño de la plataforma y el software son propiedad del titular del servicio o de sus licenciantes. Queda prohibida su reproducción, distribución o uso con fines comerciales sin autorización expresa por escrito. El contenido publicado por las personas usuarias es responsabilidad de cada una de ellas y no transfiere derechos de propiedad intelectual a KixxMe más allá de la licencia necesaria para operar el servicio.",
        ],
      },
      {
        heading: "6. Suscripciones y pagos",
        body: [
          "KixxMe ofrece suscripciones de pago (Plus y Gold) en modalidad mensual o anual, gestionadas a través de Stripe. Las suscripciones se renuevan automáticamente al final de cada periodo salvo que las canceles antes de la renovación. Puedes gestionar o cancelar tu suscripción según las opciones disponibles; los precios se muestran en la página de Premium.",
        ],
      },
      {
        heading: "7. Verificación",
        body: [
          "La verificación de perfil es opcional y sirve para aumentar la confianza en la comunidad. El envío de una selfie de verificación implica que aceptas que nuestro equipo la revise con esa finalidad.",
        ],
      },
      {
        heading: "8. Suspensión y cancelación de cuentas",
        body: [
          "Nos reservamos el derecho de advertir, suspender temporalmente, eliminar o cancelar de forma permanente cualquier cuenta que incumpla estos términos, las Normas de la comunidad o la legislación aplicable, sin previo aviso en casos graves. Entre las conductas que pueden dar lugar a la suspensión o cancelación se incluyen: el acoso, la suplantación de identidad, la publicación de contenido ilegal, el spam y cualquier comportamiento que ponga en riesgo la seguridad de otros usuarios.",
          "Tú también puedes desactivar o eliminar tu cuenta en cualquier momento desde los ajustes de la aplicación.",
        ],
      },
      {
        heading: "9. Limitación de responsabilidad",
        body: [
          "KixxMe es una plataforma para conocer personas; no garantizamos resultados ni verificamos la identidad de todas las personas usuarias. Debes actuar con prudencia al interactuar y al quedar con otras personas.",
          "En la medida máxima permitida por la ley aplicable, KixxMe no será responsable de daños indirectos, incidentales, especiales o consecuentes derivados del uso o la imposibilidad de uso del servicio, incluyendo pérdida de datos, interrupción del servicio o daños derivados de las interacciones con otros usuarios.",
        ],
      },
      {
        heading: "10. Ley aplicable",
        body: [
          "Estos términos se rigen por la legislación aplicable en el domicilio del titular del servicio, sin perjuicio de los derechos que te correspondan como persona consumidora.",
        ],
      },
      {
        heading: "11. Contacto",
        body: [
          "Para cualquier duda sobre estos términos, escríbenos a " + SUPPORT_EMAIL + ". Para solicitudes de eliminación de datos, contacta a " + DELETE_EMAIL + ".",
        ],
      },
    ],
  },

  cookies: {
    slug: "cookies",
    label: "Política de cookies",
    title: "Política de cookies",
    updated: UPDATED,
    intro:
      "Esta política explica cómo KixxMe utiliza cookies y tecnologías de almacenamiento similares.",
    blocks: [
      {
        heading: "1. Qué son",
        body: [
          "Las cookies y el almacenamiento local son pequeños archivos o datos que se guardan en tu dispositivo para que la aplicación funcione y recuerde tus preferencias.",
        ],
      },
      {
        heading: "2. Cómo las usamos",
        body: [
          "KixxMe utiliza principalmente almacenamiento técnico y esencial, necesario para que el servicio funcione. No utilizamos cookies de publicidad de terceros.",
        ],
        list: [
          "Sesión y autenticación: para mantener tu sesión iniciada de forma segura.",
          "Preferencias: por ejemplo, el modo de descubrimiento (tarjetas o cuadrícula) o el estado de los avisos que ya has visto.",
          "Funcionamiento: datos necesarios para mostrar correctamente la interfaz.",
        ],
      },
      {
        heading: "3. Servicios de terceros",
        body: [
          "Algunos proveedores (como Supabase, Stripe o el inicio de sesión con Google) pueden establecer sus propias cookies o almacenamiento cuando utilizas sus funciones, conforme a sus respectivas políticas.",
        ],
      },
      {
        heading: "4. Cómo gestionarlas",
        body: [
          "Puedes borrar o bloquear el almacenamiento desde la configuración de tu navegador o dispositivo. Ten en cuenta que, si desactivas el almacenamiento esencial, es posible que algunas funciones, como mantener la sesión iniciada, dejen de funcionar.",
        ],
      },
      {
        heading: "5. Contacto",
        body: ["Para cualquier duda sobre esta política, escríbenos a " + SUPPORT_EMAIL + "."],
      },
    ],
  },

  "normas-comunidad": {
    slug: "normas-comunidad",
    label: "Normas de la comunidad",
    title: "Normas de la comunidad",
    updated: UPDATED,
    intro:
      "KixxMe es un espacio para que personas gais, trans y de la comunidad LGBTQ+ se conozcan con respeto y seguridad. Para mantenerlo así, todas las personas usuarias deben seguir estas normas.",
    blocks: [
      {
        heading: "1. Respeto ante todo",
        body: [
          "Trata a las demás personas como te gustaría que te tratasen a ti. No se tolera el acoso, las amenazas, el discurso de odio ni la discriminación por orientación, identidad de género, raza, religión, origen, aspecto físico, estado serológico o cualquier otra condición.",
        ],
      },
      {
        heading: "2. Solo personas adultas",
        body: [
          "KixxMe es exclusivamente para mayores de 18 años. Está terminantemente prohibido cualquier contenido que involucre a menores. Cualquier indicio será denunciado a las autoridades competentes.",
        ],
      },
      {
        heading: "3. Fotos y contenido",
        body: [
          "Tu foto principal debe mostrarte de forma reconocible y apropiada. Respeta las normas sobre desnudez y contenido sexual explícito en las imágenes públicas. No publiques contenido violento, ilegal o que no te pertenezca.",
        ],
      },
      {
        heading: "4. Autenticidad",
        body: [
          "Sé tú mismo. No suplantes a otras personas ni crees perfiles falsos. La verificación de perfil ayuda a que la comunidad confíe en quién hay al otro lado.",
        ],
      },
      {
        heading: "5. Nada de spam ni estafas",
        body: [
          "Prohibido el spam, la publicidad no solicitada, la venta de servicios, las estafas y la solicitud de dinero o datos sensibles a otras personas usuarias.",
        ],
      },
      {
        heading: "6. Tu seguridad",
        body: [
          "No compartas datos personales sensibles antes de tiempo. Si quedas con alguien, hazlo en un lugar público y avisa a alguien de confianza. Usa las funciones de bloqueo y denuncia siempre que lo necesites.",
        ],
      },
      {
        heading: "7. Denuncias y consecuencias",
        body: [
          "Puedes denunciar perfiles, mensajes o comportamientos desde la propia app. El incumplimiento de estas normas puede conllevar advertencias, suspensión temporal o la eliminación permanente de la cuenta.",
        ],
      },
      {
        heading: "8. Contacto",
        body: ["Si necesitas ayuda o quieres reportar algo grave, escríbenos a " + SUPPORT_EMAIL + "."],
      },
    ],
  },

  contacto: {
    slug: "contacto",
    label: "Contacto",
    title: "Contacto",
    updated: UPDATED,
    intro: "¿Tienes dudas, sugerencias o necesitas ayuda? Estamos aquí para ayudarte.",
    blocks: [
      {
        heading: "Correo de soporte",
        body: [
          "Puedes escribirnos en cualquier momento a " +
            SUPPORT_EMAIL +
            " y te responderemos lo antes posible.",
        ],
      },
      {
        heading: "Soporte dentro de la app",
        body: [
          "Una vez que inicias sesión, dispones de una sección de Soporte donde puedes contactar con nuestro equipo y, si eres usuario Gold, abrir un ticket de soporte prioritario con respuesta más rápida.",
        ],
      },
      {
        heading: "Privacidad y eliminación de datos",
        body: [
          "Para solicitar la eliminación de tu cuenta y tus datos personales, escríbenos a " +
            DELETE_EMAIL +
            " indicando el correo de tu cuenta. También puedes eliminar tu cuenta directamente desde los ajustes de la app.",
        ],
      },
      {
        heading: "Asuntos legales",
        body: [
          "Para cuestiones legales, utiliza el mismo correo " +
            SUPPORT_EMAIL +
            " indicando el motivo de tu consulta.",
        ],
      },
    ],
  },

  "aviso-legal": {
    slug: "aviso-legal",
    label: "Información legal",
    title: "Información legal",
    updated: UPDATED,
    intro:
      "En cumplimiento de la normativa aplicable sobre servicios de la sociedad de la información, se facilita la siguiente información legal del servicio KixxMe.",
    blocks: [
      {
        heading: "Titular del servicio",
        body: [
          "Servicio: KixxMe.",
          "Razón social: [completar antes de publicar].",
          "NIF/CIF: [completar antes de publicar].",
          "Domicilio: [completar antes de publicar].",
          "Correo de contacto: " + SUPPORT_EMAIL + ".",
        ],
      },
      {
        heading: "Objeto",
        body: [
          'KixxMe es una aplicación social y de citas dirigida a personas mayores de 18 años de la comunidad gay, trans y LGBTQ+, que permite crear un perfil, descubrir personas cercanas, dar \\u201cme gusta\\u201d, chatear y realizar videollamadas.',
        ],
      },
      {
        heading: "Propiedad intelectual e industrial",
        body: [
          "La marca KixxMe, su logotipo, el diseño y el software son titularidad del operador del servicio o de sus licenciantes. Queda prohibida su reproducción o uso sin autorización. El contenido publicado por las personas usuarias es responsabilidad de cada una de ellas.",
        ],
      },
      {
        heading: "Responsabilidad",
        body: [
          "El titular no se hace responsable del uso indebido del servicio por parte de las personas usuarias ni del contenido generado por estas. Nos esforzamos por mantener el servicio disponible y seguro, pero no garantizamos la ausencia total de interrupciones o errores.",
        ],
      },
      {
        heading: "Legislación y jurisdicción",
        body: [
          "Las presentes condiciones se rigen por la legislación aplicable en el domicilio del titular del servicio, respetando en todo caso los derechos reconocidos a las personas consumidoras.",
        ],
      },
    ],
  },
};

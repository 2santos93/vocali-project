/**
 * The Spanish interface, and the source of truth for what a message key is.
 *
 * `MessageKey` is derived from the keys of this object, so this catalogue
 * defines the set and every other one has to match it exactly: a key added
 * here and forgotten in `en.ts` fails to compile, and a key in `en.ts` that
 * does not exist here fails to compile too. Neither can reach a reader as a
 * blank space or as a dotted identifier.
 *
 * Spanish is first because it is the product's language, not because it is
 * alphabetically convenient. When the two catalogues disagree about what a
 * screen says, this one is right.
 *
 * `{name}` marks a value supplied at the call site. A placeholder with nothing
 * to fill it is an error rather than an empty gap — see `translate.ts`.
 */
export const SPANISH_MESSAGES = {
  /* Words the whole interface shares. */
  'common.processing': 'Procesando',
  'common.loading': 'Cargando',
  'common.sending': 'Enviando',
  'common.required': '(obligatorio)',
  'common.dismiss': 'Cerrar aviso',
  'common.historyLink': 'historial',

  /* The two preference controls. */
  'preferences.theme': 'Tema',
  'preferences.theme.light': 'Claro',
  'preferences.theme.dark': 'Oscuro',
  'preferences.theme.system': 'Como el sistema',
  'preferences.language': 'Idioma',
  /*
   * A language is named in its own language in both catalogues, deliberately.
   * Somebody looking for the way out of a language they cannot read has to
   * recognise the name of the one they want; "Spanish" would be no help at all
   * to the reader who most needs this control.
   */
  'preferences.language.es': 'Español',
  'preferences.language.en': 'English',

  /* The application shell. */
  'brand.tagline': 'Transcripción clínica',
  'nav.primary': 'Principal',
  'nav.transcribeFile': 'Transcribir archivo',
  'nav.dictate': 'Dictar',
  'nav.history': 'Historial',
  'session.signOut': 'Cerrar sesión',
  'session.signingOut': 'Cerrando sesión',

  /*
   * The language spoken in a recording — not the language of the interface.
   * These two lists exist for different reasons and neither decides the other:
   * a clinician reading this application in English still dictates in Catalan.
   */
  'audioLanguage.es': 'Español',
  'audioLanguage.en': 'Inglés',
  'audioLanguage.ca': 'Catalán',
  'audioLanguage.eu': 'Euskera',
  'audioLanguage.gl': 'Gallego',

  /* What has happened to a transcription. */
  'status.PENDING_UPLOAD': 'Pendiente de subida',
  'status.PROCESSING': 'Procesando',
  'status.COMPLETED': 'Completada',
  'status.FAILED': 'Fallida',

  /* Signing in, registering, confirming an address. */
  'auth.email': 'Correo electrónico',
  'auth.emailPlaceholder': 'nombre@centro.es',
  'auth.emailMissing': 'Introduce tu correo electrónico.',
  'auth.password': 'Contraseña',
  'auth.passwordMissing': 'Introduce tu contraseña.',

  'auth.signIn.title': 'Iniciar sesión',
  'auth.signIn.description': 'Accede con la cuenta de tu centro.',
  'auth.signIn.submit': 'Entrar',
  'auth.signIn.confirmed': 'Tu cuenta ya está confirmada. Puedes iniciar sesión.',
  'auth.signIn.failed': 'No hemos podido iniciar sesión. Vuelve a intentarlo en unos minutos.',
  'auth.signIn.noAccount': '¿Todavía no tienes cuenta?',
  'auth.signIn.createAccount': 'Crear una cuenta',

  'auth.register.title': 'Crear cuenta',
  'auth.register.description': 'Te enviaremos un código para confirmar tu correo electrónico.',
  'auth.register.passwordHint':
    'Mínimo 8 caracteres, con mayúsculas, minúsculas, números y algún símbolo.',
  'auth.register.failed': 'No hemos podido crear la cuenta. Vuelve a intentarlo en unos minutos.',
  'auth.register.haveAccount': '¿Ya tienes cuenta?',

  'auth.confirm.title': 'Confirma tu correo',
  'auth.confirm.codeSent':
    'Hemos enviado un código de 6 dígitos a {email}. Revisa también la carpeta de correo no deseado.',
  'auth.confirm.codeLabel': 'Código de verificación',
  'auth.confirm.codeHint': 'Seis dígitos, sin espacios.',
  'auth.confirm.codePlaceholder': '123456',
  'auth.confirm.codeMissing': 'Introduce el código que te hemos enviado.',
  'auth.confirm.submit': 'Confirmar cuenta',
  'auth.confirm.submitting': 'Confirmando',
  'auth.confirm.resend': 'Enviar un código nuevo',
  'auth.confirm.resent':
    'Te hemos enviado un código nuevo. Puede tardar un par de minutos en llegar.',
  'auth.confirm.resendFailed': 'No hemos podido enviar un código nuevo. Inténtalo más tarde.',
  'auth.confirm.failed':
    'No hemos podido confirmar la cuenta. Vuelve a intentarlo en unos minutos.',
  'auth.confirm.noAddress':
    'Necesitamos saber qué cuenta quieres confirmar. Vuelve a introducir tus datos o inicia sesión para que te enviemos un código nuevo.',
  'auth.confirm.startOver': '¿Prefieres empezar de nuevo?',
  'auth.confirm.createAnother': 'Crear otra cuenta',

  /*
   * The failures the authentication routes report, keyed by the stable code
   * they carry rather than by the sentence they arrive with.
   *
   * The route's own sentence is the HTTP contract and stays where it is: it is
   * what a log records and what anything other than this browser would read.
   * What a reader sees is written here, in the language they chose, because
   * the server has no business knowing which language that is.
   */
  'authFailure.RATE_LIMITED':
    'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
  'authFailure.AUTH_UNAVAILABLE':
    'No hemos podido completar la operación. Vuelve a intentarlo en unos minutos.',
  'authFailure.INVALID_CREDENTIALS':
    'El correo electrónico o la contraseña no son correctos. Revísalos e inténtalo de nuevo.',
  'authFailure.ACCOUNT_NOT_CONFIRMED':
    'Tu cuenta todavía no está confirmada. Introduce el código que te enviamos por correo o pide uno nuevo.',
  'authFailure.WEAK_PASSWORD':
    'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y símbolos.',
  'authFailure.INVALID_REGISTRATION':
    'Revisa el correo electrónico y la contraseña, y vuelve a enviar el formulario.',
  'authFailure.CODE_DELIVERY_FAILED':
    'No hemos podido enviar el código a esa dirección. Comprueba que sea correcta.',
  'authFailure.CODE_EXPIRED': 'El código ha caducado. Pide uno nuevo y vuelve a introducirlo.',
  'authFailure.CODE_REJECTED':
    'El código no es correcto o ya no se puede usar. Pide uno nuevo, o inicia sesión si ya confirmaste tu cuenta.',
  'authFailure.SESSION_EXPIRED': 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  'authFailure.INVALID_INPUT':
    'Faltan datos o no tienen el formato esperado. Revisa el formulario.',
  'authFailure.PASSWORD_RESET_REQUIRED':
    'Tienes que restablecer la contraseña antes de volver a entrar.',
  'authFailure.SIGN_OUT_INCOMPLETE':
    'Hemos cerrado la sesión en este navegador, pero no hemos podido cerrarla en los demás. Vuelve a intentarlo en unos minutos.',

  /* Choosing an audio file. */
  'upload.dropInstruction': 'Arrastra un archivo de audio aquí',
  'upload.limits': 'Formatos admitidos: {formats}. Tamaño máximo: {maxSize}.',
  'upload.choose': 'Seleccionar archivo',
  'upload.selected': 'Archivo seleccionado:',
  'upload.rejected.format': 'El formato de «{fileName}» no es compatible. Admitimos {formats}.',
  'upload.rejected.empty': '«{fileName}» está vacío, así que no hay audio que transcribir.',
  'upload.rejected.tooLarge': '«{fileName}» ocupa {size} y el límite es {maxSize}.',

  /* Transcribing that file. */
  'file.title': 'Transcribir un archivo',
  'file.description':
    'Sube una grabación y la convertiremos en texto. El archivo se envía directamente al almacenamiento seguro, sin pasar por nuestros servidores.',
  'file.historyPrefix': 'Puedes consultar todas tus transcripciones en el',
  'file.heading': 'Transcribir un archivo de audio',
  'file.chooseFirst': 'Elige primero un archivo de audio para transcribirlo.',
  'file.failureTitle': 'No se ha podido transcribir',
  'file.language': 'Idioma del audio',
  'file.languageHint': 'Elige el idioma que se habla en la grabación.',
  'file.submit': 'Transcribir',
  'file.submitting': 'Transcribiendo',
  'file.again': 'Transcribir otro archivo',
  'file.uploading': 'Subiendo el archivo de audio',
  'file.preparing': 'Preparando la subida',
  'file.preparingNotice': 'Preparando la subida…',
  'file.processingNotice': 'Archivo subido. Estamos transcribiéndolo; esto puede tardar un poco.',
  'file.stillProcessingTitle': 'La transcripción sigue en curso',
  'file.stillProcessingMessage':
    'Tu archivo se ha subido correctamente y se está transcribiendo. Puedes seguir su estado desde el historial.',

  /* Dictating. */
  'dictation.title': 'Dictar por micrófono',
  'dictation.description':
    'Habla y verás el texto aparecer mientras dictas. Al detener el dictado guardaremos la transcripción junto al resto de tu historial.',
  'dictation.historyPrefix': 'Puedes consultar todos tus dictados en el',
  'dictation.heading': 'Dictar por micrófono',
  'dictation.failureTitle': 'Se ha interrumpido el dictado',
  'dictation.saved': 'La transcripción se ha guardado. Puedes consultarla en el historial.',
  'dictation.language': 'Idioma del dictado',
  'dictation.languageHint': 'El idioma no puede cambiarse una vez empezado el dictado.',
  'dictation.start': 'Empezar a dictar',
  'dictation.stop': 'Detener y guardar',
  'dictation.saveRecovered': 'Guardar lo transcrito',
  'dictation.savingDictation': 'Guardando el dictado',
  'dictation.discard': 'Descartar',
  'dictation.connecting': 'Conectando',
  'dictation.connectingNotice': 'Conectando con el servicio de transcripción…',
  'dictation.recording': 'Grabando. Habla con normalidad.',
  'dictation.finishing': 'Finalizando',
  'dictation.finishingNotice': 'Recogiendo las últimas palabras…',
  'dictation.saving': 'Guardando',
  'dictation.savingNotice': 'Guardando la transcripción…',
  'dictation.placeholder': 'Aquí aparecerá lo que digas, mientras lo dices.',
  'dictation.partialLegend': 'El texto en cursiva todavía es provisional y puede cambiar.',

  /* The history. */
  'history.title': 'Historial de transcripciones',
  'history.description':
    'Tus transcripciones, de la más reciente a la más antigua, en páginas de {pageSize}.',
  'history.caption': 'Historial de transcripciones',
  'history.column.file': 'Archivo',
  'history.column.source': 'Origen',
  'history.column.status': 'Estado',
  'history.column.duration': 'Duración',
  'history.column.size': 'Tamaño',
  'history.column.date': 'Fecha',
  'history.column.actions': 'Acciones',
  'history.source.FILE': 'Archivo',
  'history.source.MICROPHONE': 'Micrófono',
  'history.loading': 'Cargando tu historial…',
  'history.sessionExpiredTitle': 'Tu sesión ha caducado',
  'history.loadFailedTitle': 'No hemos podido cargar tu historial',
  'history.signIn': 'Iniciar sesión',
  'history.retry': 'Reintentar',
  'history.emptyTitle': 'Todavía no tienes transcripciones',
  'history.emptyDescription':
    'Sube un archivo de audio o dicta desde el micrófono para crear la primera.',
  'history.emptyAction': 'Transcribir un archivo',
  'history.pageEmptyTitle': 'Esta página ya no tiene resultados',
  'history.pageEmptyDescription':
    'Vuelve a la página anterior para seguir consultando tu historial.',
  'history.download': 'Descargar',
  'history.preparingDownload': 'Preparando la descarga',
  'history.noDownload': 'Sin descarga disponible',
  'history.pagination': 'Paginación del historial',
  'history.previous': 'Anterior',
  'history.next': 'Siguiente',
  'history.page': 'Página {number}',

  /*
   * What went wrong, as prose the reader can act on.
   *
   * The composables that decide which of these applies hold the key and not
   * the sentence, so a failure raised while the interface was in one language
   * still reads correctly after the reader switches to the other.
   */
  'failure.sessionExpired': 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  'failure.historyLoad':
    'No hemos podido cargar tu historial. Comprueba tu conexión y vuelve a intentarlo.',
  'failure.download': 'No hemos podido preparar la descarga. Vuelve a intentarlo.',
  'failure.downloadNotReady': 'Solo puedes descargar una transcripción completada.',

  'failure.upload.unknownFormat':
    'No reconocemos el formato de «{fileName}», así que no podemos transcribirlo.',
  'failure.upload.sessionExpired':
    'Tu sesión ha caducado. Vuelve a iniciar sesión para subir el archivo.',
  'failure.upload.tooLarge': 'El archivo supera el límite de 20 MB, así que no se ha aceptado.',
  'failure.upload.unsupportedFormat':
    'El formato del archivo no es compatible, así que no se ha aceptado.',
  'failure.upload.refused':
    'No se ha podido preparar la subida. Revisa el archivo y vuelve a intentarlo.',
  'failure.upload.unreachable':
    'No se ha podido contactar con el servidor. Comprueba tu conexión y reinténtalo.',
  'failure.upload.storageRefused':
    'El almacenamiento ha rechazado el archivo: el permiso de subida ha caducado o el archivo no cumple la política de tamaño. Vuelve a intentarlo con un archivo de menos de 20 MB.',
  'failure.upload.storageUnavailable':
    'El almacenamiento no ha aceptado el archivo. Inténtalo de nuevo en unos segundos.',
  'failure.upload.connectionLost':
    'Se ha perdido la conexión mientras se subía el archivo. Comprueba tu red y vuelve a intentarlo.',
  'failure.upload.timedOut':
    'La subida ha tardado demasiado y se ha interrumpido. Vuelve a intentarlo.',
  'failure.upload.aborted': 'Has cancelado la subida.',
  'failure.upload.unexpected':
    'La subida ha fallado por un motivo inesperado. Vuelve a intentarlo.',
  'failure.upload.transcriptionFailed':
    'No se ha podido transcribir el archivo. Comprueba que el audio se oye con claridad y vuelve a intentarlo.',

  'failure.microphone.denied':
    'No podemos usar el micrófono porque el navegador ha denegado el permiso. Actívalo desde el icono de la barra de direcciones y vuelve a intentarlo.',
  'failure.microphone.missing':
    'No hemos encontrado ningún micrófono disponible. Conecta uno y vuelve a intentarlo.',
  'failure.microphone.busy':
    'No hemos podido abrir el micrófono. Comprueba que ninguna otra aplicación lo esté usando y vuelve a intentarlo.',
  'failure.microphone.unavailable': 'No hemos podido abrir el micrófono. Vuelve a intentarlo.',
  'failure.microphone.unsupportedBrowser':
    'No hemos podido preparar la captura de audio en este navegador. Prueba con Chrome o Firefox actualizados.',

  'failure.dictation.credentialExpired':
    'El permiso de transcripción ha caducado y se ha interrumpido la conexión. Guarda lo transcrito y vuelve a empezar para continuar.',
  'failure.dictation.quotaExceeded':
    'Se ha agotado la cuota de transcripción en directo. Guarda lo transcrito e inténtalo más tarde.',
  'failure.dictation.providerFailed':
    'El servicio de transcripción ha fallado y se ha cortado la conexión. Guarda lo transcrito y vuelve a intentarlo en unos segundos.',
  'failure.dictation.connectionLost':
    'Se ha perdido la conexión con el servicio de transcripción. No se ha perdido nada de lo transcrito hasta ahora: guárdalo y vuelve a empezar.',
  'failure.dictation.nothingHeard':
    'No hemos captado nada de voz, así que no hay texto que guardar.',
  'failure.dictation.saveSessionExpired':
    'Tu sesión ha caducado antes de guardar. Inicia sesión en otra pestaña y vuelve a pulsar «Guardar»: el texto sigue aquí.',
  'failure.dictation.saveFailed':
    'No hemos podido guardar la transcripción. El texto sigue en pantalla; vuelve a intentarlo.',
  'failure.dictation.sessionExpired': 'Tu sesión ha caducado. Vuelve a iniciar sesión para dictar.',
  'failure.dictation.sessionUnavailable':
    'No hemos podido preparar la sesión de dictado. Inténtalo de nuevo en unos segundos.',
} as const;

/**
 * Every message this application can render, as a union of literal keys.
 *
 * Derived rather than declared, so the type and the Spanish catalogue cannot
 * disagree, and every other catalogue is a `Record` over it.
 */
export type MessageKey = keyof typeof SPANISH_MESSAGES;

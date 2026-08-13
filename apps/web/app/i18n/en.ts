import type { MessageKey } from './es';

/**
 * The English interface.
 *
 * Typed as a `Record` over the key set the Spanish catalogue defines: a key
 * missing here fails to compile, and a key here that Spanish does not have
 * fails to compile too.
 *
 * The annotation is belt and braces. `createInterfaceI18n` hands the same key
 * set to `vue-i18n` as its message schema, so the gap is caught there as well
 * — but as "I18n<false, Options[...]> is not assignable", pointing at the
 * instance rather than at the missing word. The annotation here is what makes
 * the compiler name the key and the file, which is the difference between a
 * five-second fix and a puzzle.
 *
 * There is no runtime fallback to Spanish and there is deliberately none: a
 * fallback is how half a screen ends up in the wrong language and nobody
 * notices for a month. `fallbackLocale` is `false` for the same reason.
 *
 * British spelling and a European date and decimal convention (`en-GB`, see
 * `language.ts`): the readers of this catalogue are clinicians in Spain
 * working in English, not readers in the United States, and 12/08/2026 has to
 * keep meaning the twelfth of August on both halves of the same screen.
 */
export const ENGLISH_MESSAGES: Record<MessageKey, string> = {
  'common.processing': 'Working',
  'common.loading': 'Loading',
  'common.sending': 'Sending',
  'common.required': '(required)',
  'common.dismiss': 'Dismiss notice',

  'preferences.theme': 'Theme',
  'preferences.theme.darkMode': 'Dark mode',
  'preferences.theme.system': 'Match my system',
  'preferences.language': 'Language',
  'preferences.language.current': 'Language: {language}',
  // Each language names itself, in both catalogues. See the note in `es.ts`.
  'preferences.language.es': 'Español',
  'preferences.language.en': 'English',

  'brand.tagline': 'Clinical transcription',
  'nav.primary': 'Main',
  'nav.transcribeFile': 'Transcribe a file',
  'nav.dictate': 'Dictate',
  'nav.history': 'History',
  'session.signOut': 'Sign out',
  'session.signingOut': 'Signing out',
  'session.account': 'Account for {email}',

  'audioLanguage.es': 'Spanish',
  'audioLanguage.en': 'English',
  'audioLanguage.ca': 'Catalan',
  'audioLanguage.eu': 'Basque',
  'audioLanguage.gl': 'Galician',

  'status.PENDING_UPLOAD': 'Awaiting upload',
  'status.PROCESSING': 'In progress',
  'status.COMPLETED': 'Completed',
  'status.FAILED': 'Failed',

  'auth.email': 'Email address',
  // An escaped at sign; see the note beside the Spanish entry.
  'auth.emailPlaceholder': "name{'@'}clinic.es",
  'auth.emailMissing': 'Enter your email address.',
  'auth.password': 'Password',
  'auth.passwordMissing': 'Enter your password.',

  'auth.signIn.title': 'Sign in',
  'auth.signIn.description': 'Use the account your practice gave you.',
  'auth.signIn.submit': 'Sign in',
  'auth.signIn.confirmed': 'Your account is confirmed. You can sign in now.',
  'auth.signIn.failed': 'We could not sign you in. Please try again in a few minutes.',
  'auth.signIn.noAccount': 'No account yet?',
  'auth.signIn.createAccount': 'Create an account',

  'auth.register.title': 'Create an account',
  'auth.register.description': 'We will send you a code to confirm your email address.',
  'auth.register.passwordHint':
    'At least 8 characters, with upper case, lower case, numbers and a symbol.',
  'auth.register.failed': 'We could not create the account. Please try again in a few minutes.',
  'auth.register.haveAccount': 'Already have an account?',

  'auth.confirm.title': 'Confirm your email address',
  'auth.confirm.codeSent':
    'We have sent a 6-digit code to {email}. Check your spam folder as well.',
  'auth.confirm.codeLabel': 'Verification code',
  'auth.confirm.codeHint': 'Six digits, no spaces.',
  'auth.confirm.codePlaceholder': '123456',
  'auth.confirm.codeMissing': 'Enter the code we sent you.',
  'auth.confirm.submit': 'Confirm account',
  'auth.confirm.submitting': 'Confirming',
  'auth.confirm.resend': 'Send me a new code',
  'auth.confirm.resent': 'We have sent you a new code. It may take a couple of minutes to arrive.',
  'auth.confirm.resendFailed': 'We could not send a new code. Please try again later.',
  'auth.confirm.failed': 'We could not confirm the account. Please try again in a few minutes.',
  'auth.confirm.noAddress':
    'We need to know which account you want to confirm. Enter your details again, or sign in so that we can send you a new code.',
  'auth.confirm.startOver': 'Would you rather start again?',
  'auth.confirm.createAnother': 'Create another account',

  'authFailure.RATE_LIMITED': 'Too many attempts in a row. Wait a few minutes and try again.',
  'authFailure.AUTH_UNAVAILABLE': 'We could not complete that. Please try again in a few minutes.',
  'authFailure.INVALID_CREDENTIALS':
    'That email address or password is not correct. Check them and try again.',
  'authFailure.ACCOUNT_NOT_CONFIRMED':
    'Your account is not confirmed yet. Enter the code we emailed you, or ask for a new one.',
  'authFailure.WEAK_PASSWORD':
    'The password must be at least 8 characters and include upper case, lower case, numbers and symbols.',
  'authFailure.INVALID_REGISTRATION':
    'Check the email address and the password, then send the form again.',
  'authFailure.CODE_DELIVERY_FAILED':
    'We could not send the code to that address. Check that it is correct.',
  'authFailure.CODE_EXPIRED': 'That code has expired. Ask for a new one and enter it again.',
  'authFailure.CODE_REJECTED':
    'That code is wrong or can no longer be used. Ask for a new one, or sign in if you have already confirmed your account.',
  'authFailure.SESSION_EXPIRED': 'Your session has expired. Please sign in again.',
  'authFailure.INVALID_INPUT':
    'Something is missing or is not in the expected format. Check the form.',
  'authFailure.PASSWORD_RESET_REQUIRED': 'You have to reset your password before signing in again.',
  'authFailure.SIGN_OUT_INCOMPLETE':
    'We have signed you out of this browser, but we could not sign you out of the others. Please try again in a few minutes.',

  'upload.dropInstruction': 'Drag an audio file here',
  'upload.limits': 'Accepted formats: {formats}. Maximum size: {maxSize}.',
  'upload.choose': 'Choose a file',
  'upload.selected': 'Selected file:',
  'upload.rejected.format': 'The format of “{fileName}” is not supported. We accept {formats}.',
  'upload.rejected.empty': '“{fileName}” is empty, so there is no audio to transcribe.',
  'upload.rejected.tooLarge': '“{fileName}” is {size} and the limit is {maxSize}.',

  'file.title': 'Transcribe a file',
  'file.description':
    'Upload a recording and we will turn it into text. The file goes straight to secure storage, without passing through our servers.',
  'file.heading': 'Transcribe an audio file',
  'file.resultHeading': 'Transcription',
  'file.resultPlaceholder':
    'The text will appear here as soon as the transcription finishes. It is saved to your history too.',
  'file.chooseFirst': 'Choose an audio file first, then we can transcribe it.',
  'file.failureTitle': 'We could not transcribe it',
  'file.language': 'Language of the audio',
  'file.languageHint': 'Choose the language spoken in the recording.',
  'file.submit': 'Transcribe',
  'file.submitting': 'Transcribing',
  'file.again': 'Transcribe another file',
  'file.uploading': 'Uploading the audio file',
  'file.preparing': 'Preparing the upload',
  'file.preparingNotice': 'Preparing the upload…',
  'file.processingNotice': 'File uploaded. We are transcribing it; this may take a moment.',
  'file.stillProcessingTitle': 'The transcription is still running',
  'file.stillProcessingMessage':
    'Your file was uploaded successfully and is being transcribed. You can follow its progress in your history.',

  'dictation.title': 'Dictate into the microphone',
  'dictation.description':
    'Speak and you will see the text appear as you dictate. When you stop, we will save the transcription alongside the rest of your history.',
  'dictation.heading': 'Dictate into the microphone',
  'dictation.transcriptHeading': 'Live transcript',
  'dictation.failureTitle': 'The dictation was interrupted',
  'dictation.saved': 'The transcription has been saved. You can find it in your history.',
  'dictation.language': 'Language of the dictation',
  'dictation.languageHint': 'The language cannot be changed once the dictation has started.',
  'dictation.start': 'Start dictating',
  'dictation.stop': 'Stop and save',
  'dictation.saveRecovered': 'Save what was transcribed',
  'dictation.savingDictation': 'Saving the dictation',
  'dictation.discard': 'Discard',
  'dictation.connecting': 'Connecting',
  'dictation.connectingNotice': 'Connecting to the transcription service…',
  'dictation.recording': 'Recording. Speak normally.',
  'dictation.finishing': 'Finishing',
  'dictation.finishingNotice': 'Collecting the last few words…',
  'dictation.saving': 'Saving',
  'dictation.savingNotice': 'Saving the transcription…',
  'dictation.placeholder': 'What you say will appear here, as you say it.',
  'dictation.partialLegend': 'The text in italics is still provisional and may change.',

  'history.title': 'Transcription history',
  'history.description': 'Your transcriptions, newest first, {pageSize} to a page.',
  'history.caption': 'Transcription history',
  'history.column.file': 'File',
  'history.column.source': 'Source',
  'history.column.status': 'Status',
  'history.column.duration': 'Length',
  'history.column.size': 'Size',
  'history.column.date': 'Date',
  'history.column.actions': 'Actions',
  'history.source.FILE': 'File',
  'history.source.MICROPHONE': 'Microphone',
  'history.loading': 'Loading your history…',
  'history.sessionExpiredTitle': 'Your session has expired',
  'history.loadFailedTitle': 'We could not load your history',
  'history.signIn': 'Sign in',
  'history.retry': 'Try again',
  'history.emptyTitle': 'You have no transcriptions yet',
  'history.emptyDescription':
    'Upload an audio file or dictate into the microphone to create your first one.',
  'history.emptyAction': 'Transcribe a file',
  'history.pageEmptyTitle': 'This page has no results any more',
  'history.pageEmptyDescription': 'Go back to the previous page to carry on through your history.',
  'history.download': 'Download',
  'history.preparingDownload': 'Preparing the download',
  'history.noDownload': 'No download available',
  'history.pagination': 'History pagination',
  'history.previous': 'Previous',
  'history.next': 'Next',
  'history.page': 'Page {number}',

  'failure.sessionExpired': 'Your session has expired. Please sign in again.',
  'failure.historyLoad': 'We could not load your history. Check your connection and try again.',
  'failure.download': 'We could not prepare the download. Please try again.',
  'failure.downloadNotReady': 'Only a completed transcription can be downloaded.',

  'failure.upload.unknownFormat':
    'We do not recognise the format of “{fileName}”, so we cannot transcribe it.',
  'failure.upload.sessionExpired': 'Your session has expired. Sign in again to upload the file.',
  'failure.upload.tooLarge': 'The file is over the 20 MB limit, so it was not accepted.',
  'failure.upload.unsupportedFormat': 'That file format is not supported, so it was not accepted.',
  'failure.upload.refused': 'We could not prepare the upload. Check the file and try again.',
  'failure.upload.unreachable': 'We could not reach the server. Check your connection and retry.',
  'failure.upload.storageRefused':
    'Storage refused the file: the upload permission has expired, or the file does not meet the size policy. Try again with a file smaller than 20 MB.',
  'failure.upload.storageUnavailable':
    'Storage did not accept the file. Try again in a few seconds.',
  'failure.upload.connectionLost':
    'The connection was lost while the file was uploading. Check your network and try again.',
  'failure.upload.timedOut': 'The upload took too long and was interrupted. Please try again.',
  'failure.upload.aborted': 'You cancelled the upload.',
  'failure.upload.unexpected': 'The upload failed for an unexpected reason. Please try again.',
  'failure.upload.transcriptionFailed':
    'We could not transcribe the file. Check that the audio can be heard clearly and try again.',

  'failure.microphone.denied':
    'We cannot use the microphone because the browser denied permission. Turn it on from the icon in the address bar and try again.',
  'failure.microphone.missing': 'We could not find a microphone. Connect one and try again.',
  'failure.microphone.busy':
    'We could not open the microphone. Check that no other application is using it and try again.',
  'failure.microphone.unavailable': 'We could not open the microphone. Please try again.',
  'failure.microphone.unsupportedBrowser':
    'We could not set up audio capture in this browser. Try an up-to-date Chrome or Firefox.',

  'failure.dictation.credentialExpired':
    'The transcription permission expired and the connection was interrupted. Save what was transcribed and start again to carry on.',
  'failure.dictation.quotaExceeded':
    'The live transcription quota has run out. Save what was transcribed and try again later.',
  'failure.dictation.providerFailed':
    'The transcription service failed and the connection was cut. Save what was transcribed and try again in a few seconds.',
  'failure.dictation.connectionLost':
    'The connection to the transcription service was lost. Nothing transcribed so far has been lost: save it and start again.',
  'failure.dictation.nothingHeard': 'We did not hear any speech, so there is no text to save.',
  'failure.dictation.saveSessionExpired':
    'Your session expired before we could save. Sign in on another tab and press “Save” again: the text is still here.',
  'failure.dictation.saveFailed':
    'We could not save the transcription. The text is still on screen; please try again.',
  'failure.dictation.sessionExpired': 'Your session has expired. Sign in again to dictate.',
  'failure.dictation.sessionUnavailable':
    'We could not prepare the dictation session. Try again in a few seconds.',
};

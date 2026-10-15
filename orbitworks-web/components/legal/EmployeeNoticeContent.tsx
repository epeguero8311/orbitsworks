"use client";

export default function EmployeeNoticeContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <div className="print:hidden mb-6 flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="m-0 text-sm text-gray-600">
          Print this page or save it as a PDF to give to your employees.
          English and Spanish versions are both included below.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Print / Save as PDF
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Template version: October 14, 2026. This is a sample notice for
        Customer to review, adapt, and have reviewed by its own counsel
        before giving it to Employees. It is not legal advice, and using
        it does not by itself guarantee compliance with every law that
        may apply to Customer's workforce.
      </p>

      <hr className="my-8" />

      <h2>Employee Biometric and Location Notice and Consent</h2>
      <p>
        <strong>[Company Name]</strong> uses OrbitWorks, a workforce
        time-tracking service, to record when you clock in and out of
        work. Depending on your plan, this may include face verification
        and location features described below.
      </p>

      <h3>1. Face Verification</h3>
      <p>
        <strong>What is collected:</strong> a reference photo of your
        face (your profile photo), and a new photo of your face captured
        automatically each time you clock in or clock out.
      </p>
      <p>
        <strong>Why:</strong> the photo taken at clock-in/clock-out is
        compared against your reference photo to confirm it is really
        you clocking in, so that time and attendance records are
        accurate.
      </p>
      <p>
        <strong>How:</strong> the comparison is performed by a third-party
        facial-recognition service (currently Amazon Web Services
        Rekognition). A mismatch or unclear photo never blocks you from
        clocking in or out; it only creates an alert for your employer to
        review.
      </p>
      <p>
        <strong>Retention:</strong> your reference photo is kept while it
        is your active profile photo. If it is ever replaced, the old
        photo is kept for up to 30 days and then deleted. Clock-in/
        clock-out photos are kept as part of your attendance history. You
        may ask [Company Name] to delete your photos at any time, subject
        to legal recordkeeping requirements.
      </p>
      <p>
        <strong>No other use:</strong> your facial data is never sold,
        leased, traded, used for advertising, or used to train artificial
        intelligence or machine-learning models.
      </p>

      <h3>2. Location</h3>
      <p>
        <strong>What is collected:</strong> if your employer's plan
        includes this feature, your device's approximate location
        (latitude/longitude) at the moment you clock in or clock out, if
        you have granted "while using the app" location permission.
      </p>
      <p>
        <strong>What is NOT collected:</strong> your employer cannot see
        your location continuously or in the background, and cannot see
        your location while you are clocked out or between clock events.
        Only a single location snapshot is captured at each clock-in and
        clock-out.
      </p>
      <p>
        <strong>Why:</strong> to show which job site a clock-in/clock-out
        happened at and, if your employer has turned on a geofence for a
        site, to flag whether you were inside or outside that site's
        radius. Being outside a geofence never blocks your clock-in or
        clock-out; it only creates an alert for your employer to review.
      </p>

      <h3>3. Your Consent</h3>
      <p>
        By signing below, you acknowledge that you have received and
        read this notice, and you consent to [Company Name]'s collection
        and use of your facial and location information as described
        above, for the purpose of timekeeping and attendance
        verification.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm text-gray-500">Employee signature</p>
          <div className="h-10 border-b border-gray-400" />
        </div>
        <div>
          <p className="mb-1 text-sm text-gray-500">Date</p>
          <div className="h-10 border-b border-gray-400" />
        </div>
        <div>
          <p className="mb-1 text-sm text-gray-500">Employee name (printed)</p>
          <div className="h-10 border-b border-gray-400" />
        </div>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        [Company Name] should keep a copy of this signed notice and make
        the retention schedule above available to the Employee on
        request.
      </p>

      <div className="mt-12 break-before-page">
        <hr className="my-8" />

        <h2>Aviso y Consentimiento de Datos Biometricos y Ubicacion del Empleado</h2>
        <p>
          <strong>[Nombre de la Empresa]</strong> utiliza OrbitWorks, un
          servicio de control de tiempo laboral, para registrar cuando
          usted entra y sale del trabajo. Segun su plan, esto puede
          incluir verificacion facial y funciones de ubicacion descritas
          a continuacion.
        </p>

        <h3>1. Verificacion Facial</h3>
        <p>
          <strong>Que se recopila:</strong> una foto de referencia de su
          rostro (su foto de perfil), y una nueva foto de su rostro
          capturada automaticamente cada vez que usted entra o sale del
          trabajo.
        </p>
        <p>
          <strong>Por que:</strong> la foto tomada al entrar o salir se
          compara con su foto de referencia para confirmar que es
          realmente usted quien esta registrando su entrada o salida, de
          modo que los registros de tiempo y asistencia sean exactos.
        </p>
        <p>
          <strong>Como:</strong> la comparacion la realiza un servicio de
          reconocimiento facial de un tercero (actualmente Amazon Web
          Services Rekognition). Una discrepancia o una foto poco clara
          nunca le impide registrar su entrada o salida; solo genera una
          alerta para que su empleador la revise.
        </p>
        <p>
          <strong>Retencion:</strong> su foto de referencia se conserva
          mientras sea su foto de perfil activa. Si alguna vez se
          reemplaza, la foto anterior se conserva hasta 30 dias y luego
          se elimina. Las fotos de entrada/salida se conservan como parte
          de su historial de asistencia. Usted puede solicitar a
          [Nombre de la Empresa] que elimine sus fotos en cualquier
          momento, sujeto a los requisitos legales de conservacion de
          registros.
        </p>
        <p>
          <strong>Ningun otro uso:</strong> sus datos faciales nunca se
          venden, se alquilan, se intercambian, se usan para publicidad,
          ni se usan para entrenar modelos de inteligencia artificial o
          aprendizaje automatico.
        </p>

        <h3>2. Ubicacion</h3>
        <p>
          <strong>Que se recopila:</strong> si el plan de su empleador
          incluye esta funcion, la ubicacion aproximada de su dispositivo
          (latitud/longitud) en el momento en que usted entra o sale del
          trabajo, si usted ha otorgado el permiso de ubicacion
          "mientras se usa la aplicacion."
        </p>
        <p>
          <strong>Que NO se recopila:</strong> su empleador no puede ver
          su ubicacion de forma continua ni en segundo plano, y no puede
          ver su ubicacion mientras usted esta fuera de turno o entre
          registros de entrada/salida. Solo se captura una sola
          instantanea de ubicacion en cada entrada y salida.
        </p>
        <p>
          <strong>Por que:</strong> para mostrar en que sitio de trabajo
          ocurrio una entrada/salida y, si su empleador ha activado un
          geocerco para un sitio, para indicar si usted estaba dentro o
          fuera del radio de ese sitio. Estar fuera de un geocerco nunca
          le impide registrar su entrada o salida; solo genera una
          alerta para que su empleador la revise.
        </p>

        <h3>3. Su Consentimiento</h3>
        <p>
          Al firmar a continuacion, usted reconoce que ha recibido y
          leido este aviso, y consiente la recopilacion y el uso de su
          informacion facial y de ubicacion por parte de [Nombre de la
          Empresa] como se describe anteriormente, con el proposito de
          verificacion de tiempo y asistencia.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm text-gray-500">Firma del empleado</p>
            <div className="h-10 border-b border-gray-400" />
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-500">Fecha</p>
            <div className="h-10 border-b border-gray-400" />
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-500">
              Nombre del empleado (en letra de imprenta)
            </p>
            <div className="h-10 border-b border-gray-400" />
          </div>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          [Nombre de la Empresa] debe conservar una copia de este aviso
          firmado y poner a disposicion del empleado el calendario de
          conservacion mencionado anteriormente cuando lo solicite.
        </p>
      </div>
    </div>
  );
}

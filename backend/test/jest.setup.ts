// Variables de entorno mínimas para que las pruebas e2e puedan levantar
// AppModule completo (incluye ConfigModule.validate) sin depender de un
// archivo .env real. Nunca se usan fuera de un proceso de test: son
// secretos de juguete, sin ningún valor real, y solo existen en memoria
// durante la ejecución de Jest.
process.env.JWT_ACCESS_SECRET ??=
  'test-only-access-secret-do-not-use-in-real-environments';
process.env.JWT_REFRESH_SECRET ??=
  'test-only-refresh-secret-do-not-use-in-real-environments';

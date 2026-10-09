// Variables de entorno mínimas para que las pruebas e2e puedan levantar
// AppModule completo (incluye ConfigModule.validate) sin depender de un
// archivo .env real. Nunca se usan fuera de un proceso de test: son
// secretos de juguete, sin ningún valor real, y solo existen en memoria
// durante la ejecución de Jest.
process.env.JWT_ACCESS_SECRET ??=
  'test-only-access-secret-do-not-use-in-real-environments';

// El flujo real opt-in usa COACHING_E2E_DATABASE_URL; el resto prueba guards/DTOs.
process.env.DATABASE_URL ??=
  'postgresql://test:test@localhost:5432/test_only_do_not_use?schema=public';

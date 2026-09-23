// Variables de entorno mínimas para que las pruebas e2e puedan levantar
// AppModule completo (incluye ConfigModule.validate) sin depender de un
// archivo .env real. Nunca se usan fuera de un proceso de test: son
// secretos de juguete, sin ningún valor real, y solo existen en memoria
// durante la ejecución de Jest.
process.env.JWT_ACCESS_SECRET ??=
  'test-only-access-secret-do-not-use-in-real-environments';
process.env.JWT_REFRESH_SECRET ??=
  'test-only-refresh-secret-do-not-use-in-real-environments';

// Desde PROMPT 05, DATABASE_URL es obligatoria en env.validation.ts (ver ese
// archivo). Ninguna prueba e2e existente ejecuta una consulta real contra
// Postgres (PrismaService conecta de forma perezosa y los guards/DTOs
// rechazan las requests antes de llegar a Prisma — ver test/*.e2e-spec.ts),
// así que este valor solo necesita tener forma válida para pasar la
// validación de arranque; nunca se usa para conectarse a una base de datos
// real.
process.env.DATABASE_URL ??=
  'postgresql://test:test@localhost:5432/test_only_do_not_use?schema=public';
